"""
ingest_oopt: load protected areas (OOPT) from a GeoJSON file into protected_area table.

Usage:
    python pipelines/ingest_oopt.py --region lenoblast --file data/oopt/oopt_lenoblast.geojson
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# Category mapping
# ---------------------------------------------------------------------------

def _map_category(raw: str | None) -> str:
    if not raw:
        return "other"
    s = str(raw).lower()
    if "заповедник" in s:
        return "zapovednik"
    if "национальный парк" in s or "нацпарк" in s:
        return "nat_park"
    if "природный парк" in s:
        return "prirodny_park"
    if "заказник" in s:
        return "zakaznik"
    if "памятник природы" in s:
        return "pamyatnik"
    return "other"


def _pick(props: dict, keys: list[str], default=None):
    for k in keys:
        if k in props:
            return props[k]
    return default


_CATEGORY_KEYS = ["KATEGORIA", "CATEGORY", "CAT", "category", "kategoria", "CATEGIRY"]
_NAME_KEYS     = ["NAME_RU", "NAME", "name", "NAME_FULL", "NAIM"]
_FEDERAL_KEYS  = ["STATUS_FED", "FED_STATUS", "federal", "FEDERAL"]
_ID_KEYS       = ["OBJECTID", "ID", "id", "FID", "externalid"]

_FEDERAL_TRUTHY = {"федеральный", "federal", "1", "true"}


def _is_federal(value) -> bool:
    if value is True:
        return True
    if value in (1, True):
        return True
    if isinstance(value, str) and value.strip().lower() in _FEDERAL_TRUTHY:
        return True
    return False


# ---------------------------------------------------------------------------
# Rough area estimate (degrees^2 * 111320^2)
# ---------------------------------------------------------------------------

def _rough_area(coords_rings: list) -> float:
    """Shoelace area of first ring in degrees, then scale to m^2."""
    ring = coords_rings[0]
    n = len(ring)
    area = 0.0
    for i in range(n - 1):
        x0, y0 = ring[i][0], ring[i][1]
        x1, y1 = ring[i + 1][0], ring[i + 1][1]
        area += x0 * y1 - x1 * y0
    return abs(area) / 2.0 * (111320 ** 2)


def _geojson_area_m2(geom: dict) -> float:
    gtype = geom.get("type", "")
    coords = geom.get("coordinates", [])
    if gtype == "Polygon":
        return _rough_area(coords)
    if gtype == "MultiPolygon":
        return sum(_rough_area(ring) for ring in coords)
    return 0.0


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def _to_wkt_multi(geom: dict) -> str | None:
    """Return ST_Multi(ST_GeomFromGeoJSON(...)) expression text — we pass JSON to psycopg."""
    gtype = geom.get("type", "")
    if gtype not in ("Polygon", "MultiPolygon"):
        return None
    return json.dumps(geom)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

from db_utils import resolve_dsn


def main() -> None:
    ap = argparse.ArgumentParser(description="Ingest OOPT GeoJSON into protected_area table")
    ap.add_argument("--region", default="lenoblast")
    ap.add_argument("--file",   default="data/oopt/oopt_lenoblast.geojson")
    ap.add_argument("--dsn",    default=None)
    args = ap.parse_args()

    try:
        import psycopg
    except ImportError:
        sys.exit("psycopg (v3) is required: pip install psycopg[binary]")

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
        row = conn.execute(
            "SELECT id FROM region WHERE code = %s", (args.region,)
        ).fetchone()
        if row is None:
            sys.exit(f"region not found in DB: {args.region!r}")
        region_id: int = row[0]

        conn.execute("DELETE FROM protected_area WHERE region_id = %s", (region_id,))
        print(f"deleted existing rows for region_id={region_id}")

        inserted = 0
        skipped  = 0
        batch    = 0

        for idx, feat in enumerate(features):
            geom = feat.get("geometry")
            props = feat.get("properties") or {}

            if geom is None:
                skipped += 1
                continue

            gtype = geom.get("type", "")
            if gtype not in ("Polygon", "MultiPolygon"):
                skipped += 1
                continue

            geom_json = json.dumps(geom)

            # name
            name = _pick(props, _NAME_KEYS)
            if not name:
                name = f"OOPT_{idx}"

            # category
            raw_cat = _pick(props, _CATEGORY_KEYS)
            oopt_category = _map_category(raw_cat)

            # federal
            federal = _is_federal(_pick(props, _FEDERAL_KEYS))

            # externalid
            ext_id = _pick(props, _ID_KEYS)
            if ext_id is None:
                ext_id = str(idx)
            else:
                ext_id = str(ext_id)

            # area
            area_m2 = _geojson_area_m2(geom)

            conn.execute(
                """
                INSERT INTO protected_area
                    (region_id, externalid, name, oopt_category, federal,
                     geometry, area_m2)
                VALUES (
                    %s, %s, %s, %s, %s,
                    ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)),
                    %s
                )
                ON CONFLICT (externalid) DO UPDATE SET
                    region_id     = EXCLUDED.region_id,
                    name          = EXCLUDED.name,
                    oopt_category = EXCLUDED.oopt_category,
                    federal       = EXCLUDED.federal,
                    geometry      = EXCLUDED.geometry,
                    area_m2       = EXCLUDED.area_m2,
                    ingested_at   = now()
                """,
                (region_id, ext_id, name, oopt_category, federal,
                 geom_json, area_m2),
            )
            inserted += 1
            batch    += 1

            if batch >= 200:
                conn.commit()
                batch = 0

        conn.commit()

    print(f"done: inserted={inserted}  skipped={skipped}")


if __name__ == "__main__":
    main()
