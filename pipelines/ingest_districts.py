"""
ingest_districts: загружает OSM admin_level=6 (районы) в admin_area.

Overpass-запрос идёт через area.lo (см. download_districts_overpass.py) —
он уже гарантирует, что в ответ попадают только районы Ленобласти. Поэтому
фильтрация по пересечению с region.geometry по умолчанию выключена
(--min-overlap=0.0). Включать только если downloader переключён на bbox-query.

ВАЖНО: inner-holes у relations не обрабатываем — города фед.значения-анклавы
(Сосновый Бор внутри Ломоносовского) лежат в admin_area как отдельные записи
и перекрываются с родительским районом. При матчинге точки в район
использовать ORDER BY ST_Area ASC LIMIT 1 (самый маленький выигрывает).

Usage:
    python pipelines/ingest_districts.py --region lenoblast
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import psycopg

from db_utils import resolve_dsn


def main() -> None:
    ap = argparse.ArgumentParser(description="Ingest OSM admin_level=6 districts into admin_area")
    ap.add_argument("--region", default="lenoblast")
    ap.add_argument("--file",   default="data/osm/admin_districts_lenoblast.geojson")
    ap.add_argument("--dsn",    default=None)
    ap.add_argument(
        "--min-overlap", type=float, default=0.0,
        help="минимальная доля площади района внутри region.geometry. "
             "0.0 (дефолт) = фильтрация не применяется — запрос через area.lo в "
             "Overpass уже гарантирует, что это районы ЛО. Ставить > 0 только "
             "если downloader переключён на bbox-query.",
    )
    args = ap.parse_args()

    dsn = resolve_dsn(args.dsn)
    geojson_path = Path(args.file)
    if not geojson_path.exists():
        sys.exit(f"file not found: {geojson_path}")

    print(f"DB: {dsn[:60]}...")
    print(f"region={args.region}  file={geojson_path}  min_overlap={args.min_overlap}")

    with open(geojson_path, encoding="utf-8") as fh:
        data = json.load(fh)
    features = data.get("features") or []
    print(f"features in file: {len(features)}")

    with psycopg.connect(dsn) as conn:
        row = conn.execute("SELECT id FROM region WHERE code = %s", (args.region,)).fetchone()
        if row is None:
            sys.exit(f"region not found: {args.region!r}")
        region_id: int = row[0]

        with conn.cursor() as cur:
            cur.execute("DELETE FROM admin_area WHERE region_id = %s AND level = 6", (region_id,))
            print(f"deleted existing level=6 rows for region_id={region_id}")

            inserted = skipped_no_geom = skipped_no_name = skipped_outside = 0

            for feat in features:
                props = feat.get("properties") or {}
                geom  = feat.get("geometry")
                if geom is None:
                    skipped_no_geom += 1
                    continue
                name_ru = (props.get("name_ru") or "").strip()
                if not name_ru:
                    skipped_no_name += 1
                    continue

                osm_rel_id = props.get("osm_rel_id")
                code = f"osm_rel_{osm_rel_id}" if osm_rel_id else None
                if not code:
                    skipped_no_name += 1
                    continue

                overlap = cur.execute(
                    """
                    WITH d AS (
                        SELECT ST_Multi(
                                   ST_CollectionExtract(
                                       ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)),
                                       3
                                   )
                               ) AS g
                    ),
                    r AS (SELECT geometry AS g FROM region WHERE id = %s)
                    SELECT CASE
                             WHEN ST_Area(d.g) = 0 THEN 0
                             ELSE ST_Area(ST_Intersection(d.g, r.g)) / ST_Area(d.g)
                           END,
                           ST_AsGeoJSON(d.g)
                    FROM d, r
                    """,
                    (json.dumps(geom), region_id),
                ).fetchone()

                if overlap is None:
                    skipped_outside += 1
                    continue
                frac, multi_geom_json = overlap
                if frac < args.min_overlap:
                    skipped_outside += 1
                    continue

                meta = {
                    "osm_admin_level": props.get("admin_level"),
                    "osm_rel_id":      osm_rel_id,
                    "is_in":           props.get("is_in") or None,
                    "ref":             props.get("ref") or None,
                    "wikidata":        props.get("wikidata") or None,
                    "inside_region_frac": round(float(frac), 4),
                }

                cur.execute(
                    """
                    INSERT INTO admin_area (region_id, code, level, name_ru, name_en, geometry, meta)
                    VALUES (%s, %s, 6, %s, %s,
                            ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326),
                            %s::jsonb)
                    ON CONFLICT (region_id, code) DO UPDATE SET
                        name_ru  = EXCLUDED.name_ru,
                        name_en  = EXCLUDED.name_en,
                        geometry = EXCLUDED.geometry,
                        meta     = EXCLUDED.meta
                    """,
                    (
                        region_id, code, name_ru,
                        (props.get("name_en") or None),
                        multi_geom_json,
                        json.dumps(meta, ensure_ascii=False),
                    ),
                )
                inserted += 1

            conn.commit()

            # Обновляем region.geometry/bbox на ST_Union всех районов.
            # region.geometry исходно был bbox-прямоугольником из миграции —
            # это ломало ST_Intersects-фильтры и показ границы региона на карте.
            # Объединение level=6 районов даёт точный контур ЛО (≈ реальная
            # площадь 83k км² с поправкой ~11% на неучтённые inner-holes).
            cur.execute(
                """
                UPDATE region
                SET geometry = (
                        SELECT ST_Multi(ST_UnaryUnion(ST_Collect(geometry)))
                        FROM admin_area
                        WHERE region_id = %s AND level = 6
                    ),
                    bbox = (
                        SELECT ST_Envelope(ST_Collect(geometry))::geometry(Polygon, 4326)
                        FROM admin_area
                        WHERE region_id = %s AND level = 6
                    ),
                    updated_at = now()
                WHERE id = %s
                RETURNING ROUND((ST_Area(geometry::geography)/1e6)::numeric, 0) AS km2
                """,
                (region_id, region_id, region_id),
            )
            region_km2 = cur.fetchone()[0]
            conn.commit()
            print(f"region.geometry updated from ST_Union: {region_km2} km2")

    print(
        f"done: inserted={inserted}  "
        f"skipped_outside={skipped_outside}  "
        f"skipped_no_name={skipped_no_name}  "
        f"skipped_no_geom={skipped_no_geom}"
    )


if __name__ == "__main__":
    main()
