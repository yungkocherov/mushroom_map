"""
ingest_soil: load Russian soil map (Dokuchaev / EGRPR, 1:2.5M) into PostGIS.

Стадии:
  1. lookups — справочники soil_type (295) и soil_parent (31) из xls легенд.
  2. polygons — shapefile + soil_map_M2_5-1.0.xls (атрибуты SOIL0..3, PARENT1/2),
                фильтрация по bbox региона, INSERT в soil_polygon.
  3. profiles — soil_data.xls (точечные разрезы), фильтрация по bbox региона,
                агрегация горизонтов по CardID, INSERT в soil_profile.

Источник: https://www.soil-db.ru / https://egrpr.esoil.ru
Файлы должны лежать в data/soil/ (распакованный zip + 4 xls).

Запуск:
  python pipelines/ingest_soil.py --region lenoblast
  python pipelines/ingest_soil.py --region lenoblast --step polygons
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import psycopg
import shapefile
from psycopg.types.json import Json
import warnings

warnings.filterwarnings("ignore")
import pandas as pd

from db_utils import resolve_dsn

DATA_DIR = Path(__file__).parent.parent / "data" / "soil"

NA_INT = -9999  # sentinel в xls/shp для отсутствующего значения


# ─── lookup tables ───────────────────────────────────────────────────────────

def load_lookups(conn: psycopg.Connection) -> None:
    df_soil = pd.read_excel(DATA_DIR / "soil_map_M2_5_legend-1.0.xls")
    df_par  = pd.read_excel(DATA_DIR / "soil_map_M2_5_parent_legend-1.0.xls")

    with conn.cursor() as cur:
        cur.execute("TRUNCATE soil_type, soil_parent CASCADE")
        cur.executemany(
            "INSERT INTO soil_type (soil_id, symbol, descript, zone) VALUES (%s,%s,%s,%s)",
            [
                (int(r.SOIL_ID),
                 None if pd.isna(r.Symbol)   else str(r.Symbol),
                 str(r.Descript),
                 None if pd.isna(r.Zone)     else str(r.Zone))
                for r in df_soil.itertuples(index=False)
            ],
        )
        cur.executemany(
            "INSERT INTO soil_parent (parent_id, name) VALUES (%s,%s)",
            [(int(r.PARENT_ID), str(r.Name)) for r in df_par.itertuples(index=False)],
        )
    conn.commit()
    print(f"  soil_type: {len(df_soil)}, soil_parent: {len(df_par)}")


# ─── polygons ────────────────────────────────────────────────────────────────

def _shape_to_geojson(shape) -> dict | None:
    """pyshp shape.__geo_interface__ → GeoJSON Polygon/MultiPolygon."""
    gi = shape.__geo_interface__
    t = gi.get("type")
    if t == "Polygon":
        return {"type": "Polygon", "coordinates": gi["coordinates"]}
    if t == "MultiPolygon":
        return {"type": "MultiPolygon", "coordinates": gi["coordinates"]}
    return None


def _bbox_overlap(a: tuple, b: tuple) -> bool:
    """a/b: (xmin, ymin, xmax, ymax)."""
    return not (a[2] < b[0] or b[2] < a[0] or a[3] < b[1] or b[3] < a[1])


def _nullify(v: int) -> int | None:
    return None if v == NA_INT else int(v)


def load_polygons(conn: psycopg.Connection, region_code: str) -> None:
    # bbox региона
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, ST_XMin(bbox), ST_YMin(bbox), ST_XMax(bbox), ST_YMax(bbox) "
            "FROM region WHERE code = %s", (region_code,))
        row = cur.fetchone()
        if row is None:
            sys.exit(f"region not found: {region_code!r}")
        region_id, xmin, ymin, xmax, ymax = row
    region_bbox = (float(xmin), float(ymin), float(xmax), float(ymax))
    print(f"  region {region_code} bbox: {region_bbox}")

    sf = shapefile.Reader(str(DATA_DIR / "soil_map_M2_5-1.0.shp"), encoding="cp1251")
    field_names = [f[0] for f in sf.fields[1:]]
    print(f"  total shapes: {sf.numRecords}")

    with conn.cursor() as cur:
        cur.execute("DELETE FROM soil_polygon WHERE region_id = %s", (region_id,))
        inserted = skipped = 0
        for i in range(sf.numRecords):
            shape = sf.shape(i)
            if not _bbox_overlap(tuple(shape.bbox), region_bbox):
                continue
            geom = _shape_to_geojson(shape)
            if geom is None:
                skipped += 1
                continue
            rec = dict(zip(field_names, sf.record(i)))
            cur.execute(
                """
                INSERT INTO soil_polygon
                  (region_id, poligon_id, soil0_id, soil1_id, soil2_id, soil3_id,
                   parent1_id, parent2_id, geometry, area_m2)
                VALUES
                  (%s, %s, %s, %s, %s, %s, %s, %s,
                   ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)),
                   ST_Area(ST_Transform(
                     ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326), 3857)))
                ON CONFLICT (region_id, poligon_id) DO UPDATE SET
                  soil0_id   = EXCLUDED.soil0_id,
                  soil1_id   = EXCLUDED.soil1_id,
                  soil2_id   = EXCLUDED.soil2_id,
                  soil3_id   = EXCLUDED.soil3_id,
                  parent1_id = EXCLUDED.parent1_id,
                  parent2_id = EXCLUDED.parent2_id,
                  geometry   = EXCLUDED.geometry,
                  area_m2    = EXCLUDED.area_m2,
                  ingested_at = now()
                """,
                (region_id, int(rec["POLIGON_ID"]),
                 _nullify(rec["SOIL0"]), _nullify(rec["SOIL1"]),
                 _nullify(rec["SOIL2"]), _nullify(rec["SOIL3"]),
                 _nullify(rec["PARENT1"]), _nullify(rec["PARENT2"]),
                 json.dumps(geom), json.dumps(geom)),
            )
            inserted += 1
            if inserted % 50 == 0:
                conn.commit()
        conn.commit()
    print(f"  inserted polygons: {inserted}, skipped: {skipped}")


# ─── profiles ────────────────────────────────────────────────────────────────

def load_profiles(conn: psycopg.Connection, region_code: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT ST_XMin(bbox), ST_YMin(bbox), ST_XMax(bbox), ST_YMax(bbox) "
            "FROM region WHERE code = %s", (region_code,))
        xmin, ymin, xmax, ymax = cur.fetchone()
    bbox = (float(xmin), float(ymin), float(xmax), float(ymax))

    df = pd.read_excel(DATA_DIR / "soil_data.xls")
    mask = df["LAT"].between(bbox[1], bbox[3]) & df["LONG"].between(bbox[0], bbox[2])
    loo = df[mask].copy()
    print(f"  rows in bbox: {len(loo)}, unique CardID: {loo['CardID'].nunique()}")

    with conn.cursor() as cur:
        cur.execute("TRUNCATE soil_profile")
        for card_id, group in loo.groupby("CardID"):
            top = group.sort_values("HORTOP").iloc[0]
            horizons = [
                {
                    "top":  None if pd.isna(r.HORTOP)  else int(r.HORTOP),
                    "bot":  None if pd.isna(r.HORBOT)  else int(r.HORBOT),
                    "name": None if pd.isna(r.HIAUTH)  else str(r.HIAUTH),
                    "ph":   None if pd.isna(r.PHH2O)   else float(r.PHH2O),
                    "corg": None if pd.isna(r.CORG)    else float(r.CORG),
                }
                for r in group.sort_values("HORTOP").itertuples(index=False)
            ]
            cur.execute(
                """
                INSERT INTO soil_profile
                  (card_id, soil_id, rusm, wrb06, rureg, location, landuse,
                   veg_assoc, geom, altitude_m, ph_h2o, ph_salt, corg, horizons)
                VALUES
                  (%s, %s, %s, %s, %s, %s, %s, %s,
                   ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                   %s, %s, %s, %s, %s)
                """,
                (
                    int(card_id),
                    None if pd.isna(top.SOIL_ID) else int(top.SOIL_ID),
                    None if pd.isna(top.RUSM)    else str(top.RUSM),
                    None if pd.isna(top.WRB06)   else str(top.WRB06),
                    None if pd.isna(top.RUREG)   else str(top.RUREG),
                    None if pd.isna(top.LOCAT)   else str(top.LOCAT),
                    None if pd.isna(top.LANDUS)  else str(top.LANDUS),
                    None if pd.isna(top.VEGASS)  else str(top.VEGASS),
                    float(top.LONG), float(top.LAT),
                    None if pd.isna(top.ALT)     else float(top.ALT),
                    None if pd.isna(top.PHH2O)   else float(top.PHH2O),
                    None if pd.isna(top.PHSLT)   else float(top.PHSLT),
                    None if pd.isna(top.CORG)    else float(top.CORG),
                    Json(horizons),
                ),
            )
        conn.commit()
    print(f"  inserted profiles: {loo['CardID'].nunique()}")


# ─── main ────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description="Ingest Russian soil map (EGRPR/Dokuchaev)")
    ap.add_argument("--region", default="lenoblast")
    ap.add_argument("--step", choices=["all", "lookups", "polygons", "profiles"], default="all")
    ap.add_argument("--dsn", default=None)
    args = ap.parse_args()

    if not (DATA_DIR / "soil_map_M2_5-1.0.shp").exists():
        sys.exit(f"missing {DATA_DIR / 'soil_map_M2_5-1.0.shp'} - download zip from soil-db.ru and unzip into data/soil/")

    dsn = resolve_dsn(args.dsn)
    print(f"DB: {dsn[:60]}...")

    with psycopg.connect(dsn) as conn:
        if args.step in ("all", "lookups"):
            print("-> lookups")
            load_lookups(conn)
        if args.step in ("all", "polygons"):
            print("-> polygons")
            load_polygons(conn, args.region)
        if args.step in ("all", "profiles"):
            print("-> profiles")
            load_profiles(conn, args.region)


if __name__ == "__main__":
    main()
