"""
ingest_water_zones: загружает водоохранные зоны из GeoJSON в таблицу water_zone.

Использование:
    python pipelines/ingest_water_zones.py \\
        --region lenoblast \\
        --file data/rosleshoz/fgislk_water_zones.geojson \\
        --dsn "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map"
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import psycopg
from shapely.geometry import shape, MultiPolygon, Polygon


def get_region_id(conn: psycopg.Connection, code: str) -> int:
    row = conn.execute("SELECT id FROM region WHERE code = %s", (code,)).fetchone()
    if row is None:
        raise SystemExit(f"Регион {code!r} не найден. Запусти: psql -f db/seeds/regions.sql")
    return row[0]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", default="lenoblast")
    ap.add_argument("--file", default="data/rosleshoz/fgislk_water_zones.geojson")
    ap.add_argument("--dsn", default=os.environ.get(
        "DATABASE_URL", "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map"
    ))
    args = ap.parse_args()

    geojson = json.loads(Path(args.file).read_text(encoding="utf-8"))
    features = geojson.get("features", [])
    print(f"Загружаем {len(features)} водоохранных зон → регион {args.region!r}")

    with psycopg.connect(args.dsn, autocommit=False) as conn:
        region_id = get_region_id(conn, args.region)

        # Очищаем старые данные региона
        deleted = conn.execute(
            "DELETE FROM water_zone WHERE region_id = %s", (region_id,)
        ).rowcount
        print(f"  удалено старых записей: {deleted}")

        inserted = 0
        skipped = 0
        for feat in features:
            props = feat.get("properties") or {}
            eid = props.get("externalid")
            zone_type = props.get("zone_type", "")
            layer_name = props.get("layer_name", "")
            if not eid:
                skipped += 1
                continue

            geom_raw = feat.get("geometry")
            if not geom_raw:
                skipped += 1
                continue
            try:
                geom = shape(geom_raw)
            except Exception:
                skipped += 1
                continue

            if isinstance(geom, Polygon):
                geom = MultiPolygon([geom])
            elif not isinstance(geom, MultiPolygon):
                skipped += 1
                continue

            area_m2 = geom.area * (111_320 ** 2)  # грубая оценка в м²

            conn.execute(
                """
                INSERT INTO water_zone (region_id, externalid, zone_type, layer_name, geometry, area_m2)
                VALUES (%s, %s, %s, %s, ST_Multi(ST_SetSRID(ST_GeomFromText(%s), 4326)), %s)
                ON CONFLICT (externalid) DO UPDATE SET
                    region_id = EXCLUDED.region_id,
                    zone_type = EXCLUDED.zone_type,
                    layer_name = EXCLUDED.layer_name,
                    geometry = EXCLUDED.geometry,
                    area_m2 = EXCLUDED.area_m2,
                    ingested_at = now()
                """,
                (region_id, eid, zone_type, layer_name, geom.wkt, round(area_m2, 1)),
            )
            inserted += 1
            if inserted % 500 == 0:
                conn.commit()
                print(f"  -> {inserted} зон...")

        conn.commit()

    print(f"\nГотово: {inserted} зон записано, {skipped} пропущено")


if __name__ == "__main__":
    main()
