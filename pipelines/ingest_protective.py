"""
ingest_protective: load ФГИС ЛК PROTECTIVE_FOREST features into protective_forest table.

Reads GeoJSON produced by scripts/extract_fgislk_felling_protective.py.
Idempotent: DELETEs all rows for region and re-inserts.

Usage:
    python pipelines/ingest_protective.py --region lenoblast
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
    ap.add_argument("--file", default="data/rosleshoz/fgislk_protective.geojson")
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

        conn.execute("DELETE FROM protective_forest WHERE region_id = %s", (region_id,))
        print(f"deleted existing protective_forest rows for region_id={region_id}")

        inserted = 0
        skipped = 0

        # autocommit=True + no transaction wrapper → одна плохая геометрия
        # не абортит остальные.
        with conn.cursor() as cur:
            for feat in features:
                    geom = feat.get("geometry")
                    props = feat.get("properties") or {}
                    if not geom:
                        skipped += 1
                        continue
                    eid = props.get("externalid") or ""
                    if not eid:
                        skipped += 1
                        continue
                    protect_type = props.get("area_type") or "unknown"
                    layer_name = props.get("layer_name") or "PROTECTIVE_FOREST"
                    try:
                        cur.execute(
                            """
                            INSERT INTO protective_forest (region_id, externalid, protect_type, layer_name, geometry, area_m2)
                            VALUES (
                                %s, %s, %s, %s,
                                ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))),
                                ST_Area(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326), 3857))
                            )
                            ON CONFLICT (externalid) DO UPDATE SET
                                region_id = EXCLUDED.region_id,
                                protect_type = EXCLUDED.protect_type,
                                layer_name = EXCLUDED.layer_name,
                                geometry = EXCLUDED.geometry,
                                area_m2 = EXCLUDED.area_m2,
                                ingested_at = now()
                            """,
                            (region_id, eid, protect_type, layer_name, json.dumps(geom), json.dumps(geom)),
                        )
                        inserted += 1
                        if inserted % 2000 == 0:
                            print(f"  -> {inserted}", flush=True)
                    except Exception as e:
                        skipped += 1
                        if skipped <= 5:
                            print(f"  skip {eid}: {type(e).__name__}: {e}")

        print(f"done: inserted={inserted} skipped={skipped}")


if __name__ == "__main__":
    main()
