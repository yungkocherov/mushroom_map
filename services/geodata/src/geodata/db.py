"""
Запись нормализованных полигонов в таблицу forest_polygon через COPY FROM STDIN.

Ключевое решение: вместо ON CONFLICT DO UPDATE (дорогой для UPDATE-heavy
нагрузки — для каждой строки надо проверить уникальный индекс, потом
пометить старый tuple мёртвым, записать новый, обновить все индексы и
двойной WAL) — делаем **DELETE old → INSERT new в одной транзакции**:

    1. DELETE FROM forest_polygon WHERE source=X AND source_version=Y
       — единственный BTREE-range удаляет тысячи строк за миллисекунды.
    2. COPY FROM STDIN в stage-таблицу — чистый streaming, никаких
       индексов/constraint'ов по пути.
    3. INSERT ... SELECT из stage в forest_polygon — без ON CONFLICT,
       чистый bulk-insert, индексы обновляются батчем.

Семантика: полный reimport всех строк для (source, version). Если в
source-файле чего-то не хватает что раньше было — оно удалится. Для
нашего use-case (periodic full export из ФГИС ЛК) это правильно.

Альтернатива (не реализована): UPSERT с ON CONFLICT. Работает, но в
UPDATE-heavy режиме не даёт выигрыша от COPY — нормализация в Python и
update-стоимость доминируют.
"""

from __future__ import annotations

from typing import Iterable

import psycopg
from psycopg.types.json import Jsonb

from geodata.types import NormalizedForestPolygon

#: Размер buffer'а для flush. 100 000 — достаточно большой, чтобы
#: latency COPY-протокола амортизировалась, и достаточно маленький,
#: чтобы прогресс был видимым каждую минуту.
BATCH = 100_000

_STAGE_DDL = """
    CREATE TEMP TABLE IF NOT EXISTS _forest_polygon_stage (
        region_id           integer,
        source              text,
        source_feature_id   text,
        source_version      text,
        geometry_wkt        text,     -- old path (OSM/Copernicus)
        geometry_wkb_hex    text,     -- fast path (Rosleshoz via pyogrio)
        area_m2             double precision,   -- null → computed in SQL
        dominant_species    text,
        species_composition jsonb,
        canopy_cover        double precision,
        tree_cover_density  double precision,
        confidence          double precision,
        meta                jsonb
    )
"""

_COPY_SQL = """
    COPY _forest_polygon_stage (
        region_id, source, source_feature_id, source_version,
        geometry_wkt, geometry_wkb_hex, area_m2,
        dominant_species, species_composition,
        canopy_cover, tree_cover_density, confidence, meta
    ) FROM STDIN
"""

#: INSERT из stage в forest_polygon. Без ON CONFLICT — caller удалил старые
#: строки для этого (source, source_version) в flush(). DISTINCT ON защищает
#: от дублей в input-потоке.
#:
#: Геометрия: COALESCE(WKB fast path, WKT slow path). Оба варианта проходят
#: через ST_SetSRID(4326) + ST_MakeValid + ST_Multi. ST_MakeValid нужен
#: потому что raw WKB из pyogrio может иметь self-intersections.
#:
#: area_m2: если источник прислал — берём его; иначе считаем в SQL через
#: ST_Area(geometry::geography) — geodesic m^2 в WGS84. Раньше тут было
#: ST_Area(ST_Transform(geom, 3857)) — Web Mercator, инфляция ~4x на 60N
#: (фикс в миграции 033, 2026-05-09). C-код PostGIS быстрее shapely.
#: Два фильтра применяются ПЕРЕД INSERT — bogus / dup строки не должны
#: появляться в forest_polygon вообще, не убираться post-factum.
#:
#:  1. Sanity-check ratio>3: `WHERE NOT (real_area > 3 × square_ha)` —
#:     отбрасывает inflated геометрии, где WMS GetFeatureInfo вернул
#:     соседа/квартал вместо запрошенного выдела.
#:
#:  2. Dedup-by-geometry: WHERE NOT EXISTS check vs already-inserted rows
#:     для того же (source, source_version) — отбрасывает выделы у которых
#:     md5(geom) уже есть в forest_polygon (cross-batch). ФГИС иногда
#:     возвращает один контур для нескольких object_id (соседние выделы).
#:     Оставляем тот что вставился первым (стабильно по INSERT-порядку
#:     внутри transaction).
#:
#:  3. DISTINCT ON (source, feature_id, version) — within-batch защита
#:     от duplicate cadastrals.
#:
#:  4. DISTINCT ON (md5(geom)) — within-batch dedup-by-geometry.
_INSERT_SQL = """
    WITH parsed AS (
        SELECT
            region_id, source, source_feature_id, source_version,
            -- ST_MakeValid может вернуть GeometryCollection если у source-
            -- геометрии есть self-intersections — берём только полигональные
            -- компоненты через ST_CollectionExtract(..., 3) перед ST_Multi,
            -- чтобы не схлопнулось на «GeometryCollection vs MultiPolygon».
            ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(
                COALESCE(
                    ST_GeomFromWKB(decode(geometry_wkb_hex, 'hex')),
                    ST_GeomFromText(geometry_wkt)
                ),
                4326
            )), 3)) AS geom,
            area_m2, dominant_species, species_composition,
            canopy_cover, tree_cover_density, confidence, meta
        FROM _forest_polygon_stage
    ),
    sane AS (
        -- 1. Не пустые + 2. sanity-check ratio>3 (drop inflated WMS-bogus).
        SELECT * FROM parsed
        WHERE NOT ST_IsEmpty(geom)
          AND NOT (
            (meta->>'square_ha') IS NOT NULL
            AND (meta->>'square_ha')::float > 0
            AND ST_Area(geom::geography) / 10000.0 > 3.0 * (meta->>'square_ha')::float
          )
    ),
    by_cadastral AS (
        -- 3. DISTINCT ON cadastral — защита от dup cadastrals в input.
        SELECT DISTINCT ON (source, source_feature_id, source_version) *
        FROM sane
        ORDER BY source, source_feature_id, source_version
    )
    INSERT INTO forest_polygon (
        region_id, source, source_feature_id, source_version,
        geometry, area_m2,
        dominant_species, species_composition,
        canopy_cover, tree_cover_density, confidence, meta
    )
    -- 4. GLOBAL dedup-by-geometry. С 2026-05-07 этот INSERT вызывается
    --    ОДИН раз в `finalize_inserts()` после всех batches, читая
    --    accumulated stage целиком — DISTINCT ON работает над всеми
    --    1.3M+ rows. Cross-batch dups (которые попали в разные 100k
    --    flushes) тоже dедулируются.
    --    KEY FIX 2026-05-07: ни md5 raw, ни ST_SnapToGrid(N) не ловили
    --    пары где WMS вернул "почти" одинаковые контуры. Прежний approach
    --    — ROUND(centroid, 4) + log-area-bucket — имел boundary-effect:
    --    два центроида physical 8cm apart могут попасть в разные ROUND-cells
    --    если они на 0.5-границе (29.038749 vs 29.038751 → round 4 = .0387
    --    vs .0388). Решение: integer-grid через `(x / 0.00005)::int` —
    --    это 5m grid в lon/lat, **без** boundary fragility (oба centroid'а
    --    в одном integer cell гарантированно).
    --    Composite key: (cx_grid_5m, cy_grid_5m, log-bucket area 1%).
    --    Risk false positive: distinct vydels with centroids within 5m
    --    + areas within 1% — на ЛО плотности (~260m avg spacing) practically
    --    impossible. Trade-off worth it.
    SELECT DISTINCT ON (
        FLOOR(ST_X(ST_Centroid(geom)) / 0.0001)::bigint,
        FLOOR(ST_Y(ST_Centroid(geom)) / 0.0001)::bigint,
        ROUND((LN(GREATEST(ST_Area(geom::geography), 1)) * 100)::numeric)::int
    )
        region_id, source, source_feature_id, source_version,
        geom,
        COALESCE(area_m2, ST_Area(geom::geography)),
        dominant_species, species_composition,
        canopy_cover, tree_cover_density, confidence, meta
    FROM by_cadastral
    ORDER BY
        FLOOR(ST_X(ST_Centroid(geom)) / 0.0001)::bigint,
        FLOOR(ST_Y(ST_Centroid(geom)) / 0.0001)::bigint,
        ROUND((LN(GREATEST(ST_Area(geom::geography), 1)) * 100)::numeric)::int,
        source_feature_id
"""


def upsert_forest_polygons(
    conn: psycopg.Connection,
    region_id: int,
    polygons: Iterable[NormalizedForestPolygon],
    *,
    verbose: bool = True,
) -> int:
    """
    Загружает polygons в forest_polygon через DELETE старых + COPY+INSERT новых.
    Идемпотентно: полное замещение всех строк с тем же (source, source_version).
    Возвращает количество вставленных строк.

    ВАЖНО: caller (например ingest_forest.py) может оставить conn в implicit
    транзакции после get_region_id(). Мы явно коммитим в начале, чтобы
    subsequent `with conn.transaction()` начинали настоящую транзакцию, а не
    savepoint внутри outer-txn (psycopg3 RELEASE SAVEPOINT не пишет данные
    в storage — весь ингест теряется на закрытии соединения).
    """
    conn.commit()
    with conn.cursor() as cur:
        cur.execute(_STAGE_DDL)
    conn.commit()

    # Мы удалим old-rows при первом flush, когда узнаем (source, source_version)
    # из первого poly. Отслеживаем уже очищенные ключи, чтобы не дёргать DELETE
    # каждый batch.
    deleted_keys: set[tuple[str, str]] = set()
    total = 0
    batch: list[tuple] = []

    def to_row(poly: NormalizedForestPolygon) -> tuple:
        return (
            region_id,
            poly.source,
            poly.source_feature_id,
            poly.source_version,
            poly.geometry_wkt,
            poly.geometry_wkb_hex,
            poly.area_m2,
            poly.dominant_species,
            Jsonb(poly.species_composition) if poly.species_composition else None,
            poly.canopy_cover,
            poly.tree_cover_density,
            poly.confidence,
            Jsonb(poly.meta) if poly.meta else Jsonb({}),
        )

    # Two-phase ingest для **глобального** dedup-by-geometry:
    #  Phase 1 (per batch): COPY rows в stage table — append-only, без INSERT.
    #  Phase 2 (один раз в конце): single INSERT из ВСЕЙ stage с DISTINCT ON
    #          по (centroid_x, centroid_y, area-bucket). Это catches dups
    #          через все batches, не только within-batch.
    #
    # KEY FIX 2026-05-07: previous version делала INSERT per batch — пары
    # выделов в разных batches не dедулировались (cross-batch миссы).
    # User reported visible darker pairs even after centroid+bucket key fix
    # because pairs landed in different 100k flushes.

    def flush() -> None:
        nonlocal total
        if not batch:
            return
        keys_in_batch = {(row[1], row[3]) for row in batch}
        new_keys = keys_in_batch - deleted_keys
        with conn.transaction():
            with conn.cursor() as cur:
                # Первый раз видим этот (source, version) — DELETE old + start
                # accumulating in stage. Не TRUNCATE stage между batches —
                # хотим накопить ВСЁ для финального INSERT.
                for src, ver in new_keys:
                    if verbose:
                        print(f"  -> DELETE old rows for source={src!r} version={ver!r}...", flush=True)
                    cur.execute(
                        "DELETE FROM forest_polygon WHERE source = %s AND source_version = %s",
                        (src, ver),
                    )
                    if verbose:
                        print(f"     deleted {cur.rowcount}", flush=True)
                    deleted_keys.add((src, ver))
                # COPY append в stage — НЕ TRUNCATE, чтобы накопились все batches
                with cur.copy(_COPY_SQL) as cp:
                    for row in batch:
                        cp.write_row(row)
        total += len(batch)
        if verbose:
            print(f"  -> staged {total} полигонов...", flush=True)
        batch.clear()

    def finalize_inserts() -> int:
        """Один большой INSERT из stage с GLOBAL DISTINCT ON. Вызывается
        после всех batches. Возвращает actually inserted count (после
        cross-batch dedup может быть меньше чем staged).
        """
        if verbose:
            print(f"  -> finalize: global INSERT с dedup-by-geometry...", flush=True)
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(_INSERT_SQL)
                inserted = cur.rowcount
                cur.execute("TRUNCATE _forest_polygon_stage")
        if verbose:
            print(f"     inserted {inserted} (dedup-dropped {total - inserted})", flush=True)
        return inserted

    for poly in polygons:
        batch.append(to_row(poly))
        if len(batch) >= BATCH:
            flush()
    flush()

    if total > 0:
        total = finalize_inserts()
    return total


def get_region_id(conn: psycopg.Connection, code: str) -> int:
    row = conn.execute(
        "SELECT id FROM region WHERE code = %s", (code,)
    ).fetchone()
    if row is None:
        raise ValueError(
            f"Регион {code!r} не найден в таблице region. "
            f"Запусти: psql -f db/seeds/regions.sql"
        )
    return row[0]
