"""
Загружает лесные полигоны для региона через выбранный ForestSource.

Использование:
    python pipelines/ingest_forest.py --source osm --region lenoblast
    python pipelines/ingest_forest.py --source osm --region lenoblast --dry-run
"""

from __future__ import annotations

import argparse
import os
import sys
import time

# Добавляем src директории в PYTHONPATH
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "services", "geodata", "src"))

import psycopg

from geodata.db import get_region_id, upsert_forest_polygons
from geodata.sources import get_source
from geodata.types import BoundingBox


def get_region_bbox(conn: psycopg.Connection, code: str) -> BoundingBox:
    row = conn.execute(
        """
        SELECT
            ST_XMin(bbox) AS min_lon,
            ST_YMin(bbox) AS min_lat,
            ST_XMax(bbox) AS max_lon,
            ST_YMax(bbox) AS max_lat
        FROM region WHERE code = %s
        """,
        (code,),
    ).fetchone()
    if row is None:
        raise ValueError(f"Регион {code!r} не найден")
    return BoundingBox(
        min_lon=float(row[0]),
        min_lat=float(row[1]),
        max_lon=float(row[2]),
        max_lat=float(row[3]),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest forest polygons for a region")
    parser.add_argument("--source", required=True, choices=["osm", "copernicus"],
                        help="Forest data source")
    parser.add_argument("--region", required=True,
                        help="Region code from table region (e.g. lenoblast)")
    parser.add_argument("--dsn", default=None,
                        help="PostgreSQL DSN; если не задан — берётся из $DATABASE_URL")
    parser.add_argument("--dry-run", action="store_true",
                        help="Только скачать и распарсить, не писать в БД")
    args = parser.parse_args()

    dsn = args.dsn or os.environ.get("DATABASE_URL")
    if not dsn:
        print("ERROR: DATABASE_URL не задан", file=sys.stderr)
        sys.exit(2)

    print(f"=== ingest_forest source={args.source} region={args.region} ===")
    t0 = time.time()

    with psycopg.connect(dsn) as conn:
        region_id = get_region_id(conn, args.region)
        bbox = get_region_bbox(conn, args.region)
        print(f"Регион id={region_id}, bbox={bbox}")

        SourceClass = get_source(args.source)
        source = SourceClass()

        print(f"Скачиваю данные через {args.source}...")
        normalized = source.fetch_normalized(bbox)

        if args.dry_run:
            count = 0
            for poly in normalized:
                count += 1
                if count <= 5:
                    print(f"  {poly.dominant_species} conf={poly.confidence:.1f} "
                          f"area={poly.area_m2 / 10_000:.1f}га  {poly.source_feature_id}")
            print(f"\nDry-run: распарсено {count} полигонов, в БД не пишем.")
        else:
            count = upsert_forest_polygons(conn, region_id, normalized, verbose=True)
            conn.commit()
            print(f"\nГотово: {count} полигонов за {time.time() - t0:.1f}с")


if __name__ == "__main__":
    main()
