"""
Запись нормализованных полигонов в таблицу forest_polygon.
"""

from __future__ import annotations

import json
from typing import Iterable

import psycopg
import psycopg.rows

from geodata.types import NormalizedForestPolygon

BATCH = 2000  # строк за одну транзакцию


def upsert_forest_polygons(
    conn: psycopg.Connection,
    region_id: int,
    polygons: Iterable[NormalizedForestPolygon],
    *,
    verbose: bool = True,
) -> int:
    """
    Батч-вставка полигонов через executemany. Идемпотентно:
        ON CONFLICT (source, source_feature_id, source_version) DO UPDATE
    Возвращает количество вставленных/обновлённых строк.
    """
    total = 0
    batch: list[NormalizedForestPolygon] = []

    SQL = """
        INSERT INTO forest_polygon (
            region_id, source, source_feature_id, source_version,
            geometry, area_m2,
            dominant_species, species_composition,
            canopy_cover, tree_cover_density, confidence, meta
        )
        VALUES (
            %(region_id)s, %(source)s, %(source_feature_id)s, %(source_version)s,
            ST_Multi(ST_SetSRID(ST_GeomFromText(%(wkt)s), 4326)),
            %(area_m2)s,
            %(dominant_species)s, %(species_composition)s,
            %(canopy_cover)s, %(tree_cover_density)s, %(confidence)s,
            %(meta)s
        )
        ON CONFLICT (source, source_feature_id, source_version)
        DO UPDATE SET
            region_id          = EXCLUDED.region_id,
            geometry           = EXCLUDED.geometry,
            area_m2            = EXCLUDED.area_m2,
            dominant_species   = EXCLUDED.dominant_species,
            species_composition= EXCLUDED.species_composition,
            canopy_cover       = EXCLUDED.canopy_cover,
            tree_cover_density = EXCLUDED.tree_cover_density,
            confidence         = EXCLUDED.confidence,
            meta               = EXCLUDED.meta,
            ingested_at        = now()
    """

    def flush(b: list[NormalizedForestPolygon]) -> None:
        nonlocal total
        if not b:
            return
        params = [
            {
                "region_id": region_id,
                "source": poly.source,
                "source_feature_id": poly.source_feature_id,
                "source_version": poly.source_version,
                "wkt": poly.geometry_wkt,
                "area_m2": poly.area_m2,
                "dominant_species": poly.dominant_species,
                "species_composition": (
                    json.dumps(poly.species_composition)
                    if poly.species_composition else None
                ),
                "canopy_cover": poly.canopy_cover,
                "tree_cover_density": poly.tree_cover_density,
                "confidence": poly.confidence,
                "meta": json.dumps(poly.meta),
            }
            for poly in b
        ]
        with conn.transaction():
            conn.executemany(SQL, params)
        total += len(b)
        if verbose:
            print(f"  → записано {total} полигонов...")

    for poly in polygons:
        batch.append(poly)
        if len(batch) >= BATCH:
            flush(batch)
            batch = []

    flush(batch)
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
