"""
Запись нормализованных полигонов в таблицу forest_polygon через COPY FROM STDIN.

Идея: для больших батчей (сотни тысяч полигонов) executemany() медленный —
каждая строка гоняется как отдельный параметризованный запрос. COPY FROM STDIN
стримит всё пачкой в одну команду и даёт в 5-10× ускорение.

Алгоритм:
    1. Создаём temp-таблицу `_forest_polygon_stage` с теми же колонками, что
       в forest_polygon, но с geometry как text (WKT) — так COPY может писать
       плоский текст, а геометрию распарсит ST_GeomFromText в финальном INSERT.
    2. Копим batch строк в памяти (BATCH=50k — в 25× больше чем прежние 2k).
    3. При flush: TRUNCATE stage → COPY batch-строки → INSERT ... SELECT
       ... FROM stage ON CONFLICT DO UPDATE.
    4. DISTINCT ON в SELECT защищает от дублей в batch'е с одинаковым ключом
       (иначе PostgreSQL ругается "ON CONFLICT DO UPDATE command cannot affect
       row a second time").
"""

from __future__ import annotations

import json
from typing import Iterable

import psycopg
from psycopg.types.json import Jsonb

from geodata.types import NormalizedForestPolygon

#: Размер batch'а для flush. 50 000 — компромисс: крупнее → реже коммиты и
#: выше throughput, но дольше первый прогресс-принт и больше памяти для stage.
BATCH = 50_000

#: DDL stage-таблицы. Колонки совпадают с forest_polygon кроме:
#:   - id / ingested_at → автогенерируются в финальной таблице, не копируются
#:   - geometry → text (WKT) в stage, geometry в finale, ST_GeomFromText в SELECT
_STAGE_DDL = """
    CREATE TEMP TABLE IF NOT EXISTS _forest_polygon_stage (
        region_id           integer,
        source              text,
        source_feature_id   text,
        source_version      text,
        geometry_wkt        text,
        area_m2             double precision,
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
        geometry_wkt, area_m2,
        dominant_species, species_composition,
        canopy_cover, tree_cover_density, confidence, meta
    ) FROM STDIN
"""

#: INSERT из stage в forest_polygon. DISTINCT ON защищает от batch-дублей.
#: ST_Multi + ST_SetSRID(ST_GeomFromText(...), 4326) собирает финальную геометрию.
_UPSERT_SQL = """
    INSERT INTO forest_polygon (
        region_id, source, source_feature_id, source_version,
        geometry, area_m2,
        dominant_species, species_composition,
        canopy_cover, tree_cover_density, confidence, meta
    )
    SELECT DISTINCT ON (source, source_feature_id, source_version)
        region_id, source, source_feature_id, source_version,
        ST_Multi(ST_SetSRID(ST_GeomFromText(geometry_wkt), 4326)),
        area_m2, dominant_species, species_composition,
        canopy_cover, tree_cover_density, confidence, meta
    FROM _forest_polygon_stage
    ORDER BY source, source_feature_id, source_version
    ON CONFLICT (source, source_feature_id, source_version) DO UPDATE SET
        region_id           = EXCLUDED.region_id,
        geometry            = EXCLUDED.geometry,
        area_m2             = EXCLUDED.area_m2,
        dominant_species    = EXCLUDED.dominant_species,
        species_composition = EXCLUDED.species_composition,
        canopy_cover        = EXCLUDED.canopy_cover,
        tree_cover_density  = EXCLUDED.tree_cover_density,
        confidence          = EXCLUDED.confidence,
        meta                = EXCLUDED.meta,
        ingested_at         = now()
"""


def upsert_forest_polygons(
    conn: psycopg.Connection,
    region_id: int,
    polygons: Iterable[NormalizedForestPolygon],
    *,
    verbose: bool = True,
) -> int:
    """
    Батч-загрузка полигонов через COPY FROM STDIN + INSERT ... ON CONFLICT.
    Идемпотентно: ON CONFLICT (source, source_feature_id, source_version) UPDATE.
    Возвращает количество вставленных/обновлённых строк.
    """
    # Создаём stage-таблицу один раз за сессию (session-level temp)
    with conn.cursor() as cur:
        cur.execute(_STAGE_DDL)

    total = 0
    batch: list[tuple] = []

    def to_row(poly: NormalizedForestPolygon) -> tuple:
        """NormalizedForestPolygon → tuple для cur.copy().write_row()."""
        return (
            region_id,
            poly.source,
            poly.source_feature_id,
            poly.source_version,
            poly.geometry_wkt,
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
        with conn.transaction():
            with conn.cursor() as cur:
                # TRUNCATE быстрее чем DELETE для temp-таблицы
                cur.execute("TRUNCATE _forest_polygon_stage")
                # COPY batch в stage
                with cur.copy(_COPY_SQL) as cp:
                    for row in batch:
                        cp.write_row(row)
                # Переливаем в forest_polygon с ON CONFLICT
                cur.execute(_UPSERT_SQL)
        total += len(batch)
        if verbose:
            print(f"  -> загружено {total} полигонов...")
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
