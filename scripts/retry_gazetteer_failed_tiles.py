"""
Retry 3-х gazetteer-тайлов, которые упали при основной загрузке (все три
mirror'а захлебнулись одновременно на этих центральных квадратах ЛО).

Стратегия: каждый bbox режем дополнительно на 2×2 (всего 12 под-тайлов),
per-tile tolerance уже есть в fetch_osm_places. Дальше upsert тем же
кодом placenames.gazetteer.upsert_gazetteer, но в режиме append: не
удаляем существующие osm-записи, вставляем только новые.

Запуск:
    PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe -u scripts/retry_gazetteer_failed_tiles.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import psycopg

REPO_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(REPO_ROOT / "services" / "placenames" / "src"))
sys.path.insert(0, str(REPO_ROOT / "pipelines"))

from placenames.gazetteer import fetch_osm_places, normalize_name  # noqa: E402
from db_utils import build_dsn  # noqa: E402


# Три bbox, которые упали в основном прогоне
FAILED_TILES = [
    (59.58, 32.00, 60.16, 33.85),   # tile 14
    (60.16, 28.29, 60.75, 30.14),   # tile 17 — центральный LO
    (60.16, 32.00, 60.75, 33.85),   # tile 19
]


def _append_entries(conn, region_id: int, entries: list) -> int:
    """Вставляет новые gazetteer_entry без удаления существующих.

    Дедуп на стороне БД по (region_id, name_normalized, kind, lon, lat) —
    если запись уже есть, пропускаем. admin_area_id вычисляется через
    ST_Contains, как в основном upsert.
    """
    n_ins = 0
    n_skip = 0
    with conn.transaction():
        for e in entries:
            existing = conn.execute(
                """
                SELECT 1 FROM gazetteer_entry
                WHERE region_id = %s
                  AND name_normalized = %s
                  AND kind = %s
                  AND ROUND(ST_Y(point)::numeric, 4) = ROUND(%s::numeric, 4)
                  AND ROUND(ST_X(point)::numeric, 4) = ROUND(%s::numeric, 4)
                LIMIT 1
                """,
                (region_id, e.name_normalized, e.kind, e.lat, e.lon),
            ).fetchone()
            if existing:
                n_skip += 1
                continue
            conn.execute(
                """
                INSERT INTO gazetteer_entry (
                    region_id, name_ru, name_normalized, aliases, kind,
                    admin_area_id, point, popularity, source, meta
                )
                VALUES (
                    %s, %s, %s, %s, %s,
                    (SELECT id FROM admin_area
                     WHERE region_id = %s
                       AND ST_Contains(geometry, ST_SetSRID(ST_MakePoint(%s, %s), 4326))
                     ORDER BY level DESC LIMIT 1),
                    ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                    %s, %s, %s::jsonb
                )
                """,
                (
                    region_id, e.name_ru, e.name_normalized, e.aliases, e.kind,
                    region_id, e.lon, e.lat,
                    e.lon, e.lat,
                    e.popularity, e.source,
                    json.dumps(e.meta, ensure_ascii=False, default=str),
                ),
            )
            n_ins += 1
    return n_ins, n_skip


def main() -> None:
    dsn = build_dsn()
    print(f"DB: {dsn[:60]}...")

    total_inserted = 0
    total_skipped = 0

    with psycopg.connect(dsn) as conn:
        for idx, bbox in enumerate(FAILED_TILES, 1):
            print(f"\n=== tile {idx}/{len(FAILED_TILES)} bbox={bbox} (split=2) ===")
            try:
                # split=2 = 4 под-тайла, каждый в ~3-4 раза меньше исходного
                entries = fetch_osm_places(bbox, split=2)
            except Exception as e:
                print(f"  STILL FAILED: {e}")
                continue
            if not entries:
                print("  empty")
                continue
            n_ins, n_skip = _append_entries(conn, region_id=1, entries=entries)
            total_inserted += n_ins
            total_skipped += n_skip
            print(f"  inserted={n_ins}  skipped(dup)={n_skip}")
        conn.commit()

    print(f"\n=== total inserted={total_inserted}  skipped={total_skipped} ===")


if __name__ == "__main__":
    main()
