"""
ingest_waterway: load OSM linear waterways into osm_waterway.

Usage:
    python pipelines/ingest_waterway.py --region lenoblast
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import psycopg

from db_utils import resolve_dsn

ALLOWED_WATERWAY = {"stream", "river", "canal", "drain", "ditch"}


def _parse_osm_id(raw) -> int | None:
    if raw is None:
        return None
    s = str(raw).strip()
    if s.startswith("way/"):
        s = s[4:]
    if s.startswith(("relation/", "node/")):
        return None
    try:
        return int(s)
    except ValueError:
        return None


def main() -> None:
    ap = argparse.ArgumentParser(description="Ingest OSM waterways into osm_waterway")
    ap.add_argument("--region", default="lenoblast")
    ap.add_argument("--file",   default="data/osm/waterway_lenoblast.geojson")
    ap.add_argument("--dsn",    default=None)
    args = ap.parse_args()

    dsn = resolve_dsn(args.dsn)
    geojson_path = Path(args.file)
    if not geojson_path.exists():
        sys.exit(f"file not found: {geojson_path}")

    print(f"DB: {dsn[:60]}...")
    print(f"region={args.region}  file={geojson_path}")

    with open(geojson_path, encoding="utf-8") as fh:
        data = json.load(fh)
    features = data.get("features", [])
    print(f"features in file: {len(features)}")

    with psycopg.connect(dsn) as conn:
        row = conn.execute("SELECT id FROM region WHERE code = %s", (args.region,)).fetchone()
        if row is None:
            sys.exit(f"region not found: {args.region!r}")
        region_id: int = row[0]

        with conn.cursor() as cur:
            cur.execute("DELETE FROM osm_waterway WHERE region_id = %s", (region_id,))
            print(f"deleted existing rows for region_id={region_id}")

            inserted = skipped = batch = 0

            def _upsert(way_id: int, kind: str, name, intermittent, geom_json: str) -> None:
                nonlocal inserted, batch
                cur.execute(
                    """
                    INSERT INTO osm_waterway
                      (id, region_id, waterway, name, intermittent, geometry)
                    VALUES
                      (%s, %s, %s, %s, %s,
                       ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))
                    ON CONFLICT (id) DO UPDATE SET
                      region_id    = EXCLUDED.region_id,
                      waterway     = EXCLUDED.waterway,
                      name         = EXCLUDED.name,
                      intermittent = EXCLUDED.intermittent,
                      geometry     = EXCLUDED.geometry,
                      ingested_at  = now()
                    """,
                    (way_id, region_id, kind, name, intermittent, geom_json),
                )
                inserted += 1
                batch    += 1

            for feat in features:
                geom  = feat.get("geometry")
                props = feat.get("properties") or {}
                if geom is None:
                    skipped += 1
                    continue
                kind = props.get("waterway") or ""
                if kind not in ALLOWED_WATERWAY:
                    skipped += 1
                    continue
                way_id = _parse_osm_id(props.get("@id") or props.get("id"))
                if way_id is None:
                    skipped += 1
                    continue

                name = props.get("name") or None
                interm_raw = props.get("intermittent")
                intermittent = (interm_raw == "yes") if interm_raw is not None else None

                gtype = geom.get("type", "")
                if gtype == "LineString":
                    _upsert(way_id, kind, name, intermittent, json.dumps(geom))
                elif gtype == "MultiLineString":
                    for sub_idx, coords in enumerate(geom.get("coordinates", [])):
                        sub_id = way_id * 1000 + sub_idx
                        _upsert(sub_id, kind, name, intermittent,
                                json.dumps({"type": "LineString", "coordinates": coords}))
                else:
                    skipped += 1
                    continue

                if batch >= 2000:
                    conn.commit()
                    batch = 0
                    print(f"  ... {inserted} inserted")

            conn.commit()

    print(f"done: inserted={inserted}  skipped={skipped}")


if __name__ == "__main__":
    main()
