"""
extract_places: привязка VK-наблюдений к геометрии через NER + газеттир.

Что делает:
    1. Читает data/vk/{group}/raw_posts.json (полный текст постов).
    2. Для каждой observation в БД без point/h3_cell, берёт её source_ref,
       находит соответствующий пост и прогоняет текст через NER.
    3. Каждое LOC-упоминание матчится против gazetteer_entry в том же region_id.
    4. Берётся лучший матч (по confidence → популярность → тип),
       результат пишется в observation.point / h3_cell / placename_raw / placename_confidence.
    5. REFRESH MATERIALIZED VIEW observation_h3_species_stats.

Использование:
    python pipelines/extract_places.py --region lenoblast --group grib_spb
    python pipelines/extract_places.py --region lenoblast --group grib_spb --limit 200
    python pipelines/extract_places.py --region lenoblast --group grib_spb --reprocess
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import h3
import psycopg
from dotenv import load_dotenv
from tqdm import tqdm

REPO_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(REPO_ROOT / "services" / "placenames" / "src"))

from placenames.geocode import GazetteerMatch, GazetteerMatcher  # noqa: E402
from placenames.ner import get_default_ner  # noqa: E402

load_dotenv(REPO_ROOT / ".env")

DEFAULT_H3_RES = 7
DATA_ROOT = REPO_ROOT / "data" / "vk"


def _build_database_url() -> str:
    if url := os.getenv("DATABASE_URL"):
        return url
    user = os.getenv("POSTGRES_USER", "mushroom")
    pw = os.getenv("POSTGRES_PASSWORD", "mushroom_dev")
    host = os.getenv("POSTGRES_HOST", "127.0.0.1")
    port = os.getenv("POSTGRES_PORT", "5434")
    db = os.getenv("POSTGRES_DB", "mushroom_map")
    return f"postgresql://{user}:{pw}@{host}:{port}/{db}"


def _load_posts(group: str) -> dict[str, dict]:
    """Читает raw_posts.json и индексирует по id -> post."""
    path = DATA_ROOT / group / "raw_posts.json"
    if not path.exists():
        raise SystemExit(f"Нет файла {path}. Сначала запусти `ingest_vk.py collect`.")
    with open(path, encoding="utf-8") as f:
        posts = json.load(f)
    return {str(p["id"]): p for p in posts}


def _pick_best_match(matches: list[tuple[str, GazetteerMatch]]) -> Optional[tuple[str, GazetteerMatch]]:
    """Выбирает лучший матч из списка (mention, match)."""
    if not matches:
        return None
    KIND_WEIGHT = {
        "settlement": 5,
        "district": 4,
        "station": 3,
        "tract": 2,
        "lake": 2,
        "river": 1,
    }
    return max(
        matches,
        key=lambda x: (x[1].confidence, KIND_WEIGHT.get(x[1].kind, 0)),
    )


@dataclass
class Stats:
    posts_seen: int = 0
    obs_seen: int = 0
    ner_empty: int = 0
    no_match: int = 0
    matched: int = 0
    updated: int = 0


def process(
    conn,
    region_id: int,
    region_code: str,
    group: str,
    *,
    limit: Optional[int] = None,
    reprocess: bool = False,
    h3_res: int = DEFAULT_H3_RES,
) -> Stats:
    posts = _load_posts(group)
    print(f"raw_posts.json: {len(posts)} постов")

    where_clause = "o.region_id = %s AND o.source = 'vk'"
    if not reprocess:
        where_clause += " AND o.point IS NULL AND o.h3_cell IS NULL"

    limit_sql = f" LIMIT {int(limit)}" if limit else ""

    rows = conn.execute(
        f"""
        SELECT DISTINCT o.source_ref
        FROM observation o
        WHERE {where_clause}
        {limit_sql}
        """,
        (region_id,),
    ).fetchall()
    source_refs: list[str] = [r[0] for r in rows if r[0]]
    print(f"Постов для обработки: {len(source_refs)}")
    if not source_refs:
        return Stats()

    ner = get_default_ner()
    matcher = GazetteerMatcher(conn, region_id)
    stats = Stats()

    for source_ref in tqdm(source_refs, desc="extract_places"):
        stats.posts_seen += 1
        # source_ref = "{group}-{post_id}"
        try:
            _, post_id = source_ref.split("-", 1)
        except ValueError:
            continue
        post = posts.get(post_id)
        if not post:
            continue

        text = post.get("text") or ""
        if not text.strip():
            stats.ner_empty += 1
            continue

        mentions = ner.extract(text)
        if not mentions:
            stats.ner_empty += 1
            continue

        matches: list[tuple[str, GazetteerMatch]] = []
        seen_normalized: set[str] = set()
        for m in mentions:
            if m.normalized in seen_normalized:
                continue
            seen_normalized.add(m.normalized)
            match = matcher.match(m.normalized)
            if match is None:
                match = matcher.match(m.surface)
            if match is not None:
                matches.append((m.surface, match))

        best = _pick_best_match(matches)
        if best is None:
            stats.no_match += 1
            continue

        surface, gm = best
        stats.matched += 1
        h3_cell = h3.latlng_to_cell(gm.lat, gm.lon, h3_res)

        # Обновляем все observation этого source_ref
        cur = conn.execute(
            """
            UPDATE observation
            SET point = ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                h3_cell = %s,
                placename_raw = %s,
                placename_confidence = %s,
                meta = meta || %s::jsonb
            WHERE source = 'vk' AND source_ref = %s
              AND region_id = %s
            """,
            (
                gm.lon, gm.lat,
                h3_cell,
                surface,
                gm.confidence,
                json.dumps(
                    {
                        "placename": {
                            "surface": surface,
                            "matched_name": gm.name_ru,
                            "kind": gm.kind,
                            "match_type": gm.match_type,
                            "gazetteer_entry_id": gm.entry_id,
                            "admin_area_id": gm.admin_area_id,
                        }
                    },
                    ensure_ascii=False,
                ),
                source_ref,
                region_id,
            ),
        )
        stats.updated += cur.rowcount

    return stats


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", default="lenoblast")
    ap.add_argument("--group", default="grib_spb")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument(
        "--reprocess",
        action="store_true",
        help="перематчивать даже те наблюдения, где point/h3_cell уже есть",
    )
    ap.add_argument("--h3-res", type=int, default=DEFAULT_H3_RES)
    args = ap.parse_args()

    dsn = _build_database_url()
    print(f"DB: {dsn[:60]}...")

    with psycopg.connect(dsn, autocommit=False) as conn:
        row = conn.execute(
            "SELECT id FROM region WHERE code = %s", (args.region,)
        ).fetchone()
        if row is None:
            raise SystemExit(f"Регион '{args.region}' не найден")
        region_id = row[0]

        with conn.transaction():
            stats = process(
                conn,
                region_id=region_id,
                region_code=args.region,
                group=args.group,
                limit=args.limit,
                reprocess=args.reprocess,
                h3_res=args.h3_res,
            )

        print("\n── Статистика ─────")
        print(f"  посты обработаны:       {stats.posts_seen}")
        print(f"  без упоминаний (NER):   {stats.ner_empty}")
        print(f"  без матча в газеттире:  {stats.no_match}")
        print(f"  успешно заматчено:      {stats.matched}")
        print(f"  строк observation обн.: {stats.updated}")

        print("\nREFRESH MATERIALIZED VIEW observation_h3_species_stats...")
        conn.execute("REFRESH MATERIALIZED VIEW observation_h3_species_stats")
        conn.commit()
        print("✅ Готово.")


if __name__ == "__main__":
    main()
