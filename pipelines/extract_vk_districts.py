"""
extract_vk_districts: VK-пост → район ЛО через Natasha + gazetteer.

Пайплайн:
    1. SELECT vk_post WHERE place_extracted_at IS NULL (или --reprocess).
    2. Natasha (PlacenameNER) извлекает LOC-упоминания из text.
    3. GazetteerMatcher матчит mention → gazetteer_entry (exact / alias / trgm).
    4. gazetteer_entry.admin_area_id указывает на район (level=6). Если
       привязка к level=8 (поселение) — ищем parent level=6 через ST_Contains
       по geometry поселения.
    5. Лучший матч (по confidence × kind-priority) пишется в vk_post:
       district_admin_area_id, district_confidence, place_extracted_at, place_match.

Отличия от старого extract_places.py:
    - Читает из vk_post напрямую (не из observation + raw_posts.json).
    - Результат идёт в vk_post.*, не в observation.point.
    - Batch-коммит; thread-safe не нужен (Natasha single-threaded).

Usage:
    python pipelines/extract_vk_districts.py --region lenoblast
    python pipelines/extract_vk_districts.py --region lenoblast --limit 500
    python pipelines/extract_vk_districts.py --region lenoblast --reprocess
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Optional

import psycopg
from tqdm import tqdm

REPO_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(REPO_ROOT / "services" / "placenames" / "src"))

from placenames.geocode import GazetteerMatch, GazetteerMatcher  # noqa: E402
from placenames.ner import get_default_ner  # noqa: E402

from db_utils import build_dsn  # noqa: E402


KIND_WEIGHT = {
    "settlement": 5,
    "district":   4,
    "station":    3,
    "tract":      2,
    "lake":       2,
    "river":      1,
    "poi":        1,
}


def _pick_best_match(
    matches: list[tuple[str, GazetteerMatch]],
) -> Optional[tuple[str, GazetteerMatch]]:
    """По убыванию: confidence × kind-priority."""
    if not matches:
        return None
    return max(
        matches,
        key=lambda x: (x[1].confidence, KIND_WEIGHT.get(x[1].kind, 0)),
    )


def _resolve_district(
    conn, gm: GazetteerMatch, region_id: int,
) -> Optional[tuple[int, str]]:
    """Возвращает (district_admin_area_id, district_name) для матча.

    Если gazetteer_entry привязан к level=6 — отдаём его.
    Если к level=8 (поселение) — ищем окружающий level=6 через ST_Contains
    по точке gazetteer_entry.point.
    Если привязки нет — матчим точку матча с районом напрямую.
    """
    # 1. Быстрый путь: admin_area_id из gazetteer уже level=6
    if gm.admin_area_id is not None:
        row = conn.execute(
            "SELECT id, name_ru, level FROM admin_area WHERE id = %s",
            (gm.admin_area_id,),
        ).fetchone()
        if row:
            area_id, name, level = row
            if level == 6:
                return area_id, name

    # 2. Fallback: point-in-polygon по району level=6
    row = conn.execute(
        """
        SELECT id, name_ru
        FROM admin_area
        WHERE region_id = %s
          AND level = 6
          AND ST_Intersects(geometry, ST_SetSRID(ST_Point(%s, %s), 4326))
        ORDER BY ST_Area(geometry) ASC
        LIMIT 1
        """,
        (region_id, gm.lon, gm.lat),
    ).fetchone()
    if row:
        return int(row[0]), row[1]
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", default="lenoblast")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--reprocess", action="store_true",
                    help="переобработать посты, у которых place_extracted_at уже проставлен")
    ap.add_argument("--batch", type=int, default=500,
                    help="commit каждые N постов")
    args = ap.parse_args()

    dsn = build_dsn()
    print(f"DB: {dsn[:60]}...")

    with psycopg.connect(dsn) as conn:
        row = conn.execute(
            "SELECT id FROM region WHERE code = %s", (args.region,)
        ).fetchone()
        if row is None:
            sys.exit(f"region not found: {args.region!r}")
        region_id: int = row[0]

        where = "text IS NOT NULL AND text <> ''"
        if not args.reprocess:
            where += " AND place_extracted_at IS NULL"
        limit_sql = f" LIMIT {int(args.limit)}" if args.limit else ""

        rows = conn.execute(
            f"SELECT id, text FROM vk_post WHERE {where} ORDER BY id {limit_sql}"
        ).fetchall()
        print(f"posts to process: {len(rows)}")
        if not rows:
            return

        print("init Natasha (loading models)...")
        ner = get_default_ner()
        matcher = GazetteerMatcher(conn, region_id)
        print("done.")

        stats = {
            "seen": 0, "ner_empty": 0, "no_match": 0,
            "matched": 0, "no_district": 0, "updated": 0,
        }
        pending = 0

        for post_id, text in tqdm(rows, desc="extract_vk_districts"):
            stats["seen"] += 1
            mentions = ner.extract(text or "")
            if not mentions:
                stats["ner_empty"] += 1
                _mark_processed(conn, post_id, None, None, {"reason": "no_ner_mentions"})
                pending += 1
                if pending >= args.batch:
                    conn.commit()
                    pending = 0
                continue

            matches: list[tuple[str, GazetteerMatch]] = []
            seen_norm: set[str] = set()
            for m in mentions:
                if m.normalized in seen_norm:
                    continue
                seen_norm.add(m.normalized)
                gm = matcher.match(m.normalized) or matcher.match(m.surface)
                if gm is not None:
                    matches.append((m.surface, gm))

            best = _pick_best_match(matches)
            if best is None:
                stats["no_match"] += 1
                _mark_processed(conn, post_id, None, None, {
                    "reason": "no_gazetteer_match",
                    "mentions": [m.surface for m in mentions[:10]],
                })
                pending += 1
                if pending >= args.batch:
                    conn.commit()
                    pending = 0
                continue

            stats["matched"] += 1
            surface, gm = best
            district = _resolve_district(conn, gm, region_id)
            if district is None:
                stats["no_district"] += 1
                _mark_processed(conn, post_id, None, float(gm.confidence), {
                    "reason": "match_outside_districts",
                    "surface": surface,
                    "matched_name": gm.name_ru,
                    "kind": gm.kind,
                })
                pending += 1
                if pending >= args.batch:
                    conn.commit()
                    pending = 0
                continue

            district_id, district_name = district
            _mark_processed(conn, post_id, district_id, float(gm.confidence), {
                "surface": surface,
                "matched_name": gm.name_ru,
                "kind": gm.kind,
                "match_type": gm.match_type,
                "gazetteer_entry_id": gm.entry_id,
                "district_name": district_name,
                "all_matches": [
                    {"surface": s, "name": m.name_ru, "kind": m.kind, "conf": m.confidence}
                    for s, m in matches[:5]
                ],
            })
            stats["updated"] += 1
            pending += 1
            if pending >= args.batch:
                conn.commit()
                pending = 0

        if pending:
            conn.commit()

        print("\n== stats ==")
        for k, v in stats.items():
            print(f"  {k:20s} {v}")

        # Топ-10 районов по размеченным постам
        top = conn.execute(
            """
            SELECT a.name_ru, COUNT(*) AS n
            FROM vk_post p
            JOIN admin_area a ON a.id = p.district_admin_area_id
            GROUP BY a.name_ru
            ORDER BY n DESC
            LIMIT 10
            """
        ).fetchall()
        if top:
            print("\ntop-10 районов:")
            for name, n in top:
                print(f"  {name:40s} {n}")


def _mark_processed(
    conn, post_id: int,
    district_id: Optional[int],
    confidence: Optional[float],
    place_match: dict,
) -> None:
    conn.execute(
        """
        UPDATE vk_post
        SET district_admin_area_id = %s,
            district_confidence    = %s,
            place_extracted_at     = now(),
            place_match            = %s::jsonb
        WHERE id = %s
        """,
        (district_id, confidence, json.dumps(place_match, ensure_ascii=False), post_id),
    )


if __name__ == "__main__":
    main()
