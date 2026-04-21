"""
build_tiles: генерация PMTiles с лесным слоем из forest_unified view.

Стратегия:
    1. Для каждого (z, x, y) в bbox региона делается один SQL-запрос
       `SELECT ST_AsMVT(...)`. PostGIS сам клипирует полигоны к границам
       тайла (ST_AsMVTGeom), проецирует в локальные координаты тайла
       (4096×4096) и кодирует в MVT-binary.
    2. Полученные байты (если не пустые) сжимаются gzip-ом и пишутся
       в PMTiles через `pmtiles.writer.Writer`.
    3. В property каждой фичи попадают `dominant_species`, `source`,
       `confidence`, `area_m2`, чтобы фронт смог раскрасить их через
       MapLibre paint-expression (см. services/web/src/lib/forestStyle.ts).

Замечания:
    - Используется стандартный Google/XYZ web mercator, НЕ custom grid.
      PostGIS даёт `ST_TileEnvelope(z, x, y)` — нативный helper.
    - source-layer в MVT = "forest" (фронт уже ищет это имя).
    - По умолчанию зумы 7..14. Выше 14 полигоны не добавляют информации,
      ниже 6 полигоны слишком мелкие чтобы их рендерить.

Использование:
    python pipelines/build_tiles.py --region lenoblast
    python pipelines/build_tiles.py --region lenoblast --minzoom 8 --maxzoom 13
    python pipelines/build_tiles.py --region lenoblast --out data/tiles/forest.pmtiles
"""

from __future__ import annotations

import argparse
import gzip
import time
from pathlib import Path

import psycopg
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer

from tile_utils import build_dsn, lonlat_to_tile, region_bbox

DEFAULT_LAYER = "forest"
DEFAULT_MINZOOM = 7
DEFAULT_MAXZOOM = 13  # z=14 в 4 раза больше тайлов, MapLibre отлично overzoom-ит с z=13
DEFAULT_EXTENT = 4096
DEFAULT_BUFFER = 64      # 64/4096 ≈ 1.6% перекрытие — устраняет видимые швы на границах тайлов
DEFAULT_REGION = "lenoblast"

# Порог area_m2 по зумам — на мелких масштабах выкидываем мелочь,
# которую всё равно не видно. Это кратно уменьшает размер PMTiles и
# ускоряет парсинг тайлов в MapLibre.
MIN_AREA_BY_ZOOM: dict[int, float] = {
    7:  500_000.0,    # 50 га
    8:  250_000.0,    # 25 га
    9:   50_000.0,    # 5 га
    10:  10_000.0,    # 1 га
    11:   3_000.0,    # 0.3 га
    # z=12+ — всё что есть в forest_unified
}




def prepare_projected_source(conn: psycopg.Connection) -> None:
    """Создаёт TEMP-таблицу forest_3857 с уже проецированной геометрией.

    Без этого каждый тайл делал бы ST_Transform заново для всех
    пересекающих полигонов. Temp-таблица + GIST-индекс — 5-10x быстрее.
    """
    conn.execute("DROP TABLE IF EXISTS forest_3857")
    conn.execute(
        """
        CREATE TEMP TABLE forest_3857 AS
        SELECT
            fu.id,
            fu.dominant_species,
            fu.source,
            fu.confidence,
            fu.area_m2,
            fp.meta,
            -- Буфер 3м закрывает зазоры между полигонами из соседних MVT-тайлов
            -- (ФГИС ЛК кодирует с точностью ~2.8 м/пкс на z12, края смежных
            -- тайлов квантуются независимо → щели ≤ 5.6 м).
            ST_Buffer(ST_Transform(fu.geometry, 3857), 3.0) AS geom
        FROM forest_unified fu
        JOIN forest_polygon fp ON fp.id = fu.id
        """
    )
    conn.execute("CREATE INDEX idx_forest_3857_gix ON forest_3857 USING GIST (geom)")
    # CLUSTER физически упорядочивает строки по индексу — range-сканы на
    # tile-bbox становятся sequential, не random. 10-15% ускорение build-а.
    conn.execute("CLUSTER forest_3857 USING idx_forest_3857_gix")
    conn.execute("ANALYZE forest_3857")


def build_tile_bytes(
    conn: psycopg.Connection,
    z: int, x: int, y: int,
    layer: str,
    extent: int,
    buffer: int,
    min_area: float,
) -> bytes | None:
    """Возвращает gzip-сжатые MVT-байты тайла или None если пусто.

    Требует предварительно вызванного prepare_projected_source(conn).
    `min_area` — нижний порог area_m2 (для уменьшения файла на низких зумах).
    """
    # Dissolve: ST_Union группой по (species, bonitet, age_group) объединяет
    # смежные/перекрывающиеся выделы одинаковых атрибутов в один полигон.
    # Убирает два артефакта сразу:
    #   1) микрощели между соседними выделами при MVT-квантовании (hairlines);
    #   2) тёмные полосы на общих рёбрах из-за 3м-overlap от ST_Buffer в
    #      forest_3857 (две полупрозрачные заливки наложены → темнее).
    # Атрибуты полигон-специфичные (id, timber_stock) теряются; кликабельность
    # через /api/forest/at не ломается — она лезет в БД по координате, не в тайл.
    row = conn.execute(
        """
        WITH tile_env AS (
            SELECT ST_TileEnvelope(%s, %s, %s) AS env
        ),
        candidates AS (
            SELECT
                f.dominant_species,
                (f.meta->>'bonitet')::int       AS bonitet,
                f.meta->>'age_group'            AS age_group,
                f.area_m2,
                (f.meta->>'timber_stock')::real AS timber_stock,
                f.geom
            FROM forest_3857 f, tile_env
            WHERE f.area_m2 >= %s
              AND f.geom && tile_env.env
        ),
        dissolved AS (
            SELECT
                dominant_species,
                bonitet,
                age_group,
                SUM(area_m2)                    AS area_m2,
                AVG(timber_stock)               AS timber_stock,
                ST_Union(ST_MakeValid(geom))    AS geom
            FROM candidates
            GROUP BY dominant_species, bonitet, age_group
        ),
        mvt_src AS (
            SELECT
                ROW_NUMBER() OVER ()            AS id,
                dominant_species,
                bonitet,
                age_group,
                area_m2,
                timber_stock,
                ST_AsMVTGeom(geom, tile_env.env, %s, %s, true) AS geom
            FROM dissolved, tile_env
        )
        SELECT ST_AsMVT(mvt_src, %s, %s, 'geom')
        FROM mvt_src
        WHERE geom IS NOT NULL
        """,
        (
            z, x, y,                    # ST_TileEnvelope
            min_area,                   # area filter
            extent, buffer,             # ST_AsMVTGeom
            layer, extent,              # ST_AsMVT
        ),
    ).fetchone()
    if row is None or row[0] is None or len(row[0]) == 0:
        return None
    return gzip.compress(bytes(row[0]))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", default=DEFAULT_REGION)
    ap.add_argument("--minzoom", type=int, default=DEFAULT_MINZOOM)
    ap.add_argument("--maxzoom", type=int, default=DEFAULT_MAXZOOM)
    ap.add_argument("--out", default="data/tiles/forest.pmtiles")
    ap.add_argument("--layer", default=DEFAULT_LAYER)
    ap.add_argument("--extent", type=int, default=DEFAULT_EXTENT)
    ap.add_argument("--buffer", type=int, default=DEFAULT_BUFFER)
    args = ap.parse_args()

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = out_path.with_suffix(".pmtiles.tmp")

    dsn = build_dsn()
    print(f"DB: {dsn[:60]}...")
    print(f"region={args.region} zoom={args.minzoom}..{args.maxzoom} out={out_path}")

    with psycopg.connect(dsn, autocommit=True) as conn:
        # Safety: один тайл с крайне сложной геометрией не должен повесить
        # всю сборку. На замерах ST_Union худшего тайла ~1.5с, 60s — 40x запас.
        conn.execute("SET statement_timeout = '60s'")
        bbox = region_bbox(conn, args.region)
        min_lon, min_lat, max_lon, max_lat = bbox
        print(f"bbox: {bbox}")

        n_rows = conn.execute("SELECT COUNT(*) FROM forest_unified").fetchone()[0]
        print(f"forest_unified rows: {n_rows}")

        print("prepare_projected_source: ST_Transform into temp table...")
        t_prep = time.monotonic()
        prepare_projected_source(conn)
        print(f"  done in {time.monotonic() - t_prep:.1f}s")

        t0 = time.monotonic()
        written = 0
        total_size = 0

        with open(tmp_path, "wb") as f:
            writer = Writer(f)

            for z in range(args.minzoom, args.maxzoom + 1):
                # XYZ: y растёт вниз, поэтому top-left = (min_lon, max_lat)
                x0, y0 = lonlat_to_tile(max_lat, min_lon, z)
                x1, y1 = lonlat_to_tile(min_lat, max_lon, z)
                x_min, x_max = min(x0, x1), max(x0, x1)
                y_min, y_max = min(y0, y1), max(y0, y1)
                n_tiles = (x_max - x_min + 1) * (y_max - y_min + 1)
                min_area_z = MIN_AREA_BY_ZOOM.get(z, 0.0)
                print(
                    f"\n  z={z:<2d} x:{x_min}..{x_max} y:{y_min}..{y_max} "
                    f"({n_tiles} tiles, min_area={min_area_z:.0f} m2)"
                )

                z_ok = 0
                z_empty = 0
                t_z = time.monotonic()
                last_log = t_z
                done_in_z = 0

                z_errors = 0
                for x in range(x_min, x_max + 1):
                    for y in range(y_min, y_max + 1):
                        try:
                            data = build_tile_bytes(
                                conn, z, x, y,
                                layer=args.layer,
                                extent=args.extent,
                                buffer=args.buffer,
                                min_area=min_area_z,
                            )
                        except psycopg.errors.QueryCanceled:
                            # statement_timeout — пропускаем тайл, не роняем сборку.
                            z_errors += 1
                            done_in_z += 1
                            print(f"     [timeout] z={z} x={x} y={y}", flush=True)
                            continue
                        done_in_z += 1
                        if data is None:
                            z_empty += 1
                            continue
                        writer.write_tile(zxy_to_tileid(z, x, y), data)
                        z_ok += 1
                        total_size += len(data)
                        written += 1

                        now = time.monotonic()
                        if now - last_log >= 5.0:
                            rate = done_in_z / (now - t_z)
                            eta = (n_tiles - done_in_z) / max(rate, 0.1)
                            print(
                                f"     {done_in_z}/{n_tiles} ok={z_ok} empty={z_empty} "
                                f"{rate:.0f} tile/s ETA {eta:.0f}s",
                                flush=True,
                            )
                            last_log = now

                dt = time.monotonic() - t_z
                rate = n_tiles / dt if dt > 0 else 0.0
                print(
                    f"     done: ok={z_ok} empty={z_empty} errors={z_errors} "
                    f"({rate:.0f} tile/s, {dt:.1f}s)",
                    flush=True,
                )

            header = {
                "version": 3,
                "tile_type": TileType.MVT,
                "tile_compression": Compression.GZIP,
                "min_zoom": args.minzoom,
                "max_zoom": args.maxzoom,
                "min_lon_e7": int(min_lon * 1e7),
                "min_lat_e7": int(min_lat * 1e7),
                "max_lon_e7": int(max_lon * 1e7),
                "max_lat_e7": int(max_lat * 1e7),
                "center_zoom": max(args.minzoom, (args.minzoom + args.maxzoom) // 2),
                "center_lon_e7": int((min_lon + max_lon) / 2 * 1e7),
                "center_lat_e7": int((min_lat + max_lat) / 2 * 1e7),
            }
            metadata = {
                "name": f"mushroom-map {args.region}",
                "description": f"forest_unified via build_tiles.py ({args.region})",
                "attribution": "OSM / Rosleshoz ФГИС ЛК",
                "vector_layers": [
                    {
                        "id": args.layer,
                        "fields": {
                            "id": "Number",
                            "dominant_species": "String",
                            "source": "String",
                            "confidence": "Number",
                            "area_m2": "Number",
                        },
                        "minzoom": args.minzoom,
                        "maxzoom": args.maxzoom,
                    }
                ],
            }
            writer.finalize(header, metadata)

        tmp_path.replace(out_path)
        elapsed = time.monotonic() - t0
        size_mb = out_path.stat().st_size / 1024 / 1024
        print(
            f"\ndone: {written} tiles written, "
            f"{size_mb:.1f} MB, {elapsed/60:.1f} min "
            f"({written / max(elapsed, 1):.0f} tile/s)"
        )


if __name__ == "__main__":
    main()
