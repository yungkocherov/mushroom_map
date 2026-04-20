"""
load_gazetteer: загружает admin_area и gazetteer_entry для региона из OSM.

Использование:
    python pipelines/load_gazetteer.py --region lenoblast
    python pipelines/load_gazetteer.py --region lenoblast --skip-admin
    python pipelines/load_gazetteer.py --region lenoblast --skip-places

Переменные окружения (из .env):
    DATABASE_URL           — postgresql://...
    POSTGRES_*             — fallback если DATABASE_URL не задан
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv

# Делаем services/placenames импортируемым без установки
REPO_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(REPO_ROOT / "services" / "placenames" / "src"))

from placenames.gazetteer import (  # noqa: E402
    fetch_osm_admin_areas,
    fetch_osm_places,
    upsert_admin_areas,
    upsert_gazetteer,
)

load_dotenv(REPO_ROOT / ".env")


from db_utils import build_dsn as _build_database_url


def _region_bbox(conn, region_code: str) -> tuple[int, tuple[float, float, float, float]]:
    """Возвращает (region_id, (south, west, north, east)) из region.bbox."""
    row = conn.execute(
        """
        SELECT id,
               ST_YMin(bbox) AS s, ST_XMin(bbox) AS w,
               ST_YMax(bbox) AS n, ST_XMax(bbox) AS e
        FROM region
        WHERE code = %s
        """,
        (region_code,),
    ).fetchone()
    if row is None:
        raise SystemExit(f"Регион '{region_code}' не найден в таблице region")
    region_id, s, w, n, e = row
    return region_id, (float(s), float(w), float(n), float(e))


def main() -> None:
    ap = argparse.ArgumentParser(description="Загрузка admin_area + gazetteer из OSM")
    ap.add_argument("--region", default="lenoblast", help="code в таблице region")
    ap.add_argument("--skip-admin", action="store_true", help="не качать admin_area")
    ap.add_argument("--skip-places", action="store_true", help="не качать gazetteer_entry")
    ap.add_argument(
        "--admin-levels",
        default="6,8",
        help="Какие admin_level качать (через запятую), по умолчанию 6 (район) и 8 (поселение)",
    )
    args = ap.parse_args()

    dsn = _build_database_url()
    print(f"DB: {dsn[:60]}...")
    levels = [int(x) for x in args.admin_levels.split(",") if x.strip()]

    with psycopg.connect(dsn, autocommit=False) as conn:
        region_id, bbox = _region_bbox(conn, args.region)
        print(f"Регион: {args.region} (id={region_id}) bbox={bbox}")

        if not args.skip_admin:
            print(f"\n→ admin_area (levels={levels})")
            areas = fetch_osm_admin_areas(bbox, levels=levels)
            if areas:
                n = upsert_admin_areas(conn, region_id, areas)
                conn.commit()
                print(f"  upserted: {n}")
            else:
                print("  пусто — возможно, Overpass вернул 0")

        if not args.skip_places:
            print(f"\n→ gazetteer_entry (places/natural/waterway/station)")
            entries = fetch_osm_places(bbox)
            if entries:
                n = upsert_gazetteer(conn, region_id, entries, link_admin_area=not args.skip_admin)
                conn.commit()
                print(f"  upserted: {n}")
            else:
                print("  пусто")

        # небольшой отчёт
        stats = conn.execute(
            """
            SELECT kind, COUNT(*) FROM gazetteer_entry
            WHERE region_id = %s AND source = 'osm'
            GROUP BY kind ORDER BY 2 DESC
            """,
            (region_id,),
        ).fetchall()
        print("\ngazetteer_entry по видам:")
        for kind, n in stats:
            print(f"  {kind:12s} {n}")

        admin_stats = conn.execute(
            "SELECT level, COUNT(*) FROM admin_area WHERE region_id = %s GROUP BY level ORDER BY level",
            (region_id,),
        ).fetchall()
        print("\nadmin_area по уровням:")
        for level, n in admin_stats:
            print(f"  level={level:<3d} {n}")

    print("\n✅ Готово.")


if __name__ == "__main__":
    main()
