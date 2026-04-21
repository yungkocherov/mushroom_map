"""
ingest_adjacent_subjects: загружает соседние субъекты РФ в region + admin_area(level=4).

Зачем: посты с mention'ом Карелии / Новгородской / Псковской / Тверской /
Вологодской сейчас хранятся только как текстовый маркер в
`place_match.detected_places`. Чтобы forecast-модель могла включать их
в training_sample (район ↔ subject × date × group), нужны записи в `region`.

Добавляет:
  - `region` — новый subject (code, name_ru, geometry, bbox, timezone)
  - `admin_area` level=4 с region_id = только что созданный subject + геометрия

Идемпотентно: upsert по region.code.

Usage:
    python pipelines/ingest_adjacent_subjects.py
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import psycopg

from db_utils import resolve_dsn


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default="data/osm/adjacent_subjects.geojson")
    ap.add_argument("--dsn", default=None)
    args = ap.parse_args()

    dsn = resolve_dsn(args.dsn)
    geojson_path = Path(args.file)
    if not geojson_path.exists():
        sys.exit(f"file not found: {geojson_path}")

    print(f"DB: {dsn[:60]}...")

    with open(geojson_path, encoding="utf-8") as fh:
        data = json.load(fh)
    features = data.get("features") or []
    print(f"subjects in file: {len(features)}")

    inserted = 0
    updated = 0

    with psycopg.connect(dsn) as conn:
        for feat in features:
            props = feat.get("properties") or {}
            geom = feat.get("geometry")
            if geom is None:
                continue
            code = props.get("code")
            name_ru = props.get("name_ru")
            if not code or not name_ru:
                continue

            with conn.cursor() as cur:
                row = cur.execute(
                    "SELECT id FROM region WHERE code = %s", (code,)
                ).fetchone()

                geom_json = json.dumps(geom)

                if row is None:
                    cur.execute(
                        """
                        INSERT INTO region (
                            code, name_ru, name_en, country_iso, geometry, bbox,
                            timezone, meta
                        )
                        VALUES (
                            %s, %s, %s, 'RU',
                            ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)),
                            ST_Envelope(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))::geometry(Polygon, 4326),
                            %s,
                            jsonb_build_object(
                                'osm_rel_id', %s::bigint,
                                'admin_level', '4',
                                'source', 'osm_overpass',
                                'is_adjacent', true
                            )
                        )
                        RETURNING id
                        """,
                        (
                            code, name_ru, props.get("name_en"),
                            geom_json, geom_json,
                            props.get("timezone") or "Europe/Moscow",
                            props.get("osm_rel_id"),
                        ),
                    )
                    region_id = cur.fetchone()[0]
                    inserted += 1
                    action = "INS"
                else:
                    region_id = row[0]
                    cur.execute(
                        """
                        UPDATE region SET
                            name_ru  = %s,
                            name_en  = %s,
                            geometry = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)),
                            bbox     = ST_Envelope(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))::geometry(Polygon, 4326),
                            timezone = %s,
                            meta     = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
                                'osm_rel_id', %s::bigint,
                                'admin_level', '4',
                                'source', 'osm_overpass',
                                'is_adjacent', true
                            ),
                            updated_at = now()
                        WHERE id = %s
                        """,
                        (
                            name_ru, props.get("name_en"),
                            geom_json, geom_json,
                            props.get("timezone") or "Europe/Moscow",
                            props.get("osm_rel_id"),
                            region_id,
                        ),
                    )
                    updated += 1
                    action = "UPD"

                # admin_area level=4: один полигон на весь subject
                code_aa = f"osm_rel_{props.get('osm_rel_id')}"
                cur.execute(
                    """
                    INSERT INTO admin_area (region_id, code, level, name_ru, name_en, geometry, meta)
                    VALUES (%s, %s, 4, %s, %s,
                            ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)),
                            jsonb_build_object(
                                'osm_rel_id', %s::bigint,
                                'admin_level', '4',
                                'source', 'osm_overpass'
                            ))
                    ON CONFLICT (region_id, code) DO UPDATE SET
                        name_ru  = EXCLUDED.name_ru,
                        name_en  = EXCLUDED.name_en,
                        geometry = EXCLUDED.geometry,
                        meta     = EXCLUDED.meta
                    """,
                    (region_id, code_aa, name_ru, props.get("name_en"),
                     geom_json, props.get("osm_rel_id")),
                )

                area_km2 = cur.execute(
                    "SELECT ROUND((ST_Area(geometry::geography)/1e6)::numeric, 0) FROM region WHERE id = %s",
                    (region_id,),
                ).fetchone()[0]
                print(f"  [{action}] {code:20s} {name_ru:30s} {area_km2} km2")

            conn.commit()

    print(f"\nregion: inserted={inserted} updated={updated}")


if __name__ == "__main__":
    main()
