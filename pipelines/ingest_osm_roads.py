"""
ingest_osm_roads: load OSM road features from a GeoJSON file into osm_road table.

Usage:
    python pipelines/ingest_osm_roads.py --region lenoblast --file data/osm/roads_lenoblast.geojson
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ALLOWED_HIGHWAY = {"track", "path", "footway", "bridleway", "cycleway"}


def _build_dsn(args_dsn: str | None) -> str:
    if args_dsn:
        return args_dsn
    if url := os.environ.get("DATABASE_URL"):
        return url
    user = os.environ.get("POSTGRES_USER", "mushroom")
    pw   = os.environ.get("POSTGRES_PASSWORD", "mushroom_dev")
    host = os.environ.get("POSTGRES_HOST", "127.0.0.1")
    port = os.environ.get("POSTGRES_PORT", "5434")
    db   = os.environ.get("POSTGRES_DB", "mushroom_map")
    return f"postgresql://{user}:{pw}@{host}:{port}/{db}"


def _parse_osm_id(raw) -> int | None:
    """Parse OSM id from @id field ('way/123456') or plain int."""
    if raw is None:
        return None
    s = str(raw).strip()
    if s.startswith("way/"):
        s = s[4:]
    if s.startswith("relation/") or s.startswith("node/"):
        return None  # not a way
    try:
        return int(s)
    except ValueError:
        return None


def _split_multilinestring(geom: dict) -> list[dict]:
    """Split a MultiLineString into individual LineString geometries."""
    lines = []
    for coords in geom.get("coordinates", []):
        lines.append({"type": "LineString", "coordinates": coords})
    return lines


def main() -> None:
    ap = argparse.ArgumentParser(description="Ingest OSM roads GeoJSON into osm_road table")
    ap.add_argument("--region", default="lenoblast")
    ap.add_argument("--file",   default="data/osm/roads_lenoblast.geojson")
    ap.add_argument("--dsn",    default=None)
    args = ap.parse_args()

    try:
        import psycopg
    except ImportError:
        sys.exit("psycopg (v3) is required: pip install psycopg[binary]")

    dsn = _build_dsn(args.dsn)
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
        row = conn.execute(
            "SELECT id FROM region WHERE code = %s", (args.region,)
        ).fetchone()
        if row is None:
            sys.exit(f"region not found in DB: {args.region!r}")
        region_id: int = row[0]

        conn.execute("DELETE FROM osm_road WHERE region_id = %s", (region_id,))
        print(f"deleted existing rows for region_id={region_id}")

        inserted = 0
        skipped  = 0
        batch    = 0

        def _upsert(way_id: int, highway: str, name, geom_json: str) -> None:
            nonlocal inserted, batch
            conn.execute(
                """
                INSERT INTO osm_road (id, region_id, highway, name, geometry)
                VALUES (
                    %s, %s, %s, %s,
                    ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)
                )
                ON CONFLICT (id) DO UPDATE SET
                    region_id   = EXCLUDED.region_id,
                    highway     = EXCLUDED.highway,
                    name        = EXCLUDED.name,
                    geometry    = EXCLUDED.geometry,
                    ingested_at = now()
                """,
                (way_id, region_id, highway, name, geom_json),
            )
            inserted += 1
            batch    += 1

        for idx, feat in enumerate(features):
            geom  = feat.get("geometry")
            props = feat.get("properties") or {}

            if geom is None:
                skipped += 1
                continue

            # highway filter
            highway = props.get("highway") or ""
            if highway not in ALLOWED_HIGHWAY:
                skipped += 1
                continue

            # OSM way id
            raw_id = props.get("@id") or props.get("id")
            way_id = _parse_osm_id(raw_id)
            if way_id is None:
                skipped += 1
                continue

            name = props.get("name") or None

            gtype = geom.get("type", "")

            if gtype == "LineString":
                _upsert(way_id, highway, name, json.dumps(geom))
            elif gtype == "MultiLineString":
                sub_lines = _split_multilinestring(geom)
                for sub_idx, sub_geom in enumerate(sub_lines):
                    # derive unique id for each component using bit-shifted sub-index
                    sub_id = way_id * 1000 + sub_idx
                    _upsert(sub_id, highway, name, json.dumps(sub_geom))
            else:
                skipped += 1
                continue

            if batch >= 1000:
                conn.commit()
                batch = 0

        conn.commit()

    print(f"done: inserted={inserted}  skipped={skipped}")


if __name__ == "__main__":
    main()
