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
import math
import os
import time
from pathlib import Path

import psycopg
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer

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


def _build_dsn() -> str:
    if url := os.environ.get("DATABASE_URL"):
        return url
    user = os.environ.get("POSTGRES_USER", "mushroom")
    pw = os.environ.get("POSTGRES_PASSWORD", "mushroom_dev")
    host = os.environ.get("POSTGRES_HOST", "127.0.0.1")
    port = os.environ.get("POSTGRES_PORT", "5434")
    db = os.environ.get("POSTGRES_DB", "mushroom_map")
    return f"postgresql://{user}:{pw}@{host}:{port}/{db}"


def lonlat_to_tile(lat: float, lon: float, z: int) -> tuple[int, int]:
    """Standard Google/XYZ tile coordinates (origin top-left, y grows south)."""
    n = 2 ** z
    x = int((lon + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat)
    y = int((1 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2 * n)
    return x, y


def region_bbox(conn: psycopg.Connection, region_code: str) -> tuple[float, float, float, float]:
    row = conn.execute(
        """
        SELECT ST_XMin(bbox), ST_YMin(bbox), ST_XMax(bbox), ST_YMax(bbox)
        FROM region WHERE code = %s
        """,
        (region_code,),
    ).fetchone()
    if row is None:
        raise SystemExit(f"регион {region_code!r} не найден")
    return tuple(float(v) for v in row)  # type: ignore[return-value]


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
            -- Буфер 3м закрывает зазоры между полигонами из соседних MVT-тайлов
            -- (ФГИС ЛК кодирует с точностью ~2.8 м/пкс на z12, края смежных
            -- тайлов квантуются независимо → щели ≤ 5.6 м).
            ST_Buffer(ST_Transform(fu.geometry, 3857), 3.0) AS geom
        FROM forest_unified fu
        """
    )
    conn.execute("CREATE INDEX idx_forest_3857_gix ON forest_3857 USING GIST (geom)")
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
    row = conn.execute(
        """
        WITH mvt_src AS (
            SELECT
                f.id,
                f.dominant_species,
                f.source,
                f.confidence,
                f.area_m2,
                ST_AsMVTGeom(f.geom, ST_TileEnvelope(%s, %s, %s), %s, %s, true) AS geom
            FROM forest_3857 f
            WHERE f.area_m2 >= %s
              AND f.geom && ST_TileEnvelope(%s, %s, %s)
        )
        SELECT ST_AsMVT(mvt_src, %s, %s, 'geom')
        FROM mvt_src
        WHERE geom IS NOT NULL
        """,
        (
            z, x, y, extent, buffer,    # ST_AsMVTGeom
            min_area,                   # area filter
            z, x, y,                    # ST_TileEnvelope
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

    dsn = _build_dsn()
    print(f"DB: {dsn[:60]}...")
    print(f"region={args.region} zoom={args.minzoom}..{args.maxzoom} out={out_path}")

    with psycopg.connect(dsn, autocommit=True) as conn:
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

                for x in range(x_min, x_max + 1):
                    for y in range(y_min, y_max + 1):
                        data = build_tile_bytes(
                            conn, z, x, y,
                            layer=args.layer,
                            extent=args.extent,
                            buffer=args.buffer,
                            min_area=min_area_z,
                        )
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
                    f"     done: ok={z_ok} empty={z_empty} "
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
