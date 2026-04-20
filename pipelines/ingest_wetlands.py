"""
ingest_wetlands: load OSM wetland polygons into wetland table.

Reads GeoJSON produced by scripts/download_wetlands_overpass.py.
Idempotent: DELETEs all rows for region and re-inserts.

Usage:
    python pipelines/ingest_wetlands.py --region lenoblast
    python pipelines/ingest_wetlands.py --region lenoblast --file data/osm/wetlands_lenoblast.geojson
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from db_utils import resolve_dsn


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", default="lenoblast")
    ap.add_argument("--file", default="data/osm/wetlands_lenoblast.geojson")
    ap.add_argument("--dsn", default=None)
    args = ap.parse_args()

    try:
        import psycopg
    except ImportError:
        sys.exit("psycopg (v3) is required")

    dsn = resolve_dsn(args.dsn)
    geojson_path = Path(args.file)
    if not geojson_path.exists():
        sys.exit(f"file not found: {geojson_path}")

    print(f"DB:     {dsn[:60]}...")
    print(f"region: {args.region}  file: {geojson_path}")

    with open(geojson_path, encoding="utf-8") as f:
        data = json.load(f)
    features = data.get("features") or []
    print(f"features in file: {len(features)}")

    with psycopg.connect(dsn, autocommit=True) as conn:
        row = conn.execute("SELECT id FROM region WHERE code = %s", (args.region,)).fetchone()
        if row is None:
            sys.exit(f"region not found: {args.region!r}")
        region_id = row[0]

        conn.execute("DELETE FROM wetland WHERE region_id = %s", (region_id,))
        print(f"deleted existing wetland rows for region_id={region_id}")

        inserted = 0
        skipped = 0

        # Без `with conn.transaction()` — в autocommit=True каждый exec
        # автоматически коммитится и ошибка на одной строке не абортит
        # всю партию (wetland из OSM часто имеет невалидные кольца).
        with conn.cursor() as cur:
            for feat in features:
                    geom = feat.get("geometry")
                    props = feat.get("properties") or {}
                    if not geom:
                        skipped += 1
                        continue
                    osm_id = props.get("@id") or ""
                    if not osm_id:
                        skipped += 1
                        continue
                    wetland = props.get("wetland") or "unspecified"
                    name = props.get("name") or None
                    try:
                        cur.execute(
                            """
                            INSERT INTO wetland (region_id, osm_id, wetland, name, geometry, area_m2)
                            VALUES (
                                %s, %s, %s, %s,
                                ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))),
                                ST_Area(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326), 3857))
                            )
                            ON CONFLICT (osm_id) DO UPDATE SET
                                region_id = EXCLUDED.region_id,
                                wetland   = EXCLUDED.wetland,
                                name      = EXCLUDED.name,
                                geometry  = EXCLUDED.geometry,
                                area_m2   = EXCLUDED.area_m2,
                                ingested_at = now()
                            """,
                            (region_id, osm_id, wetland, name, json.dumps(geom), json.dumps(geom)),
                        )
                        inserted += 1
                        if inserted % 2000 == 0:
                            print(f"  -> {inserted}", flush=True)
                    except Exception as e:
                        skipped += 1
                        if skipped <= 5:
                            print(f"  skip {osm_id}: {type(e).__name__}: {e}")

        print(f"done: inserted={inserted} skipped={skipped}")


if __name__ == "__main__":
    main()
