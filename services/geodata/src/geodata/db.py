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
#: ST_Area(ST_Transform(..., 3857)). Это ещё один проход по координатам,
#: но C-код PostGIS сильно быстрее shapely.
_INSERT_SQL = """
    WITH parsed AS (
        SELECT
            region_id, source, source_feature_id, source_version,
            ST_Multi(ST_MakeValid(ST_SetSRID(
                COALESCE(
                    ST_GeomFromWKB(decode(geometry_wkb_hex, 'hex')),
                    ST_GeomFromText(geometry_wkt)
                ),
                4326
            ))) AS geom,
            area_m2, dominant_species, species_composition,
            canopy_cover, tree_cover_density, confidence, meta
        FROM _forest_polygon_stage
    )
    INSERT INTO forest_polygon (
        region_id, source, source_feature_id, source_version,
        geometry, area_m2,
        dominant_species, species_composition,
        canopy_cover, tree_cover_density, confidence, meta
    )
    SELECT DISTINCT ON (source, source_feature_id, source_version)
        region_id, source, source_feature_id, source_version,
        geom,
        COALESCE(area_m2, ST_Area(ST_Transform(geom, 3857))),
        dominant_species, species_composition,
        canopy_cover, tree_cover_density, confidence, meta
    FROM parsed
    WHERE NOT ST_IsEmpty(geom)
    ORDER BY source, source_feature_id, source_version
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

    def flush() -> None:
        nonlocal total
        if not batch:
            return
        # Какие (source, version) ключи появились впервые — их надо очистить
        keys_in_batch = {(row[1], row[3]) for row in batch}
        new_keys = keys_in_batch - deleted_keys
        with conn.transaction():
            with conn.cursor() as cur:
                # Первый раз видим эти (source, version) — вычищаем старое.
                # Для 913k строк одного source_version это одна index-range
                # операция, занимает доли секунды.
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
                # Stage clean before each flush (иначе INSERT дублирует)
                cur.execute("TRUNCATE _forest_polygon_stage")
                with cur.copy(_COPY_SQL) as cp:
                    for row in batch:
                        cp.write_row(row)
                cur.execute(_INSERT_SQL)
        total += len(batch)
        if verbose:
            print(f"  -> загружено {total} полигонов...", flush=True)
        batch.clear()

    for poly in polygons:
        batch.append(to_row(poly))
        if len(batch) >= BATCH:
            flush()

    flush()
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
