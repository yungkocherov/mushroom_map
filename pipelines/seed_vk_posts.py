"""
seed_vk_posts: импорт сохранённого raw_posts.json в таблицу vk_post.

Мотивация: в проекте ik_mushrooms_parser уже собраны посты за 8 лет
для группы grib_spb (~130 МБ JSON). Чтобы не гонять VK API заново,
импортируем как seed — дальше ingest_vk.py будет добирать только свежее.

Формат входного файла (от collect_posts.py из parser'а):
  [{"id": ..., "date_ts": 1234567890, "date_posted": "YYYY-MM-DD",
    "text": ..., "likes": ..., "reposts": ..., "views": ...,
    "photos": N, "photo_urls": [...]}, ...]

Использование:
  python pipelines/seed_vk_posts.py \\
    --group grib_spb \\
    --in C:/Users/ikoch/ik_mushrooms_parser/data/spb/raw_posts.json \\
    --dsn "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map"

Идемпотентно: при повторном запуске конфликтующие (vk_group, post_id)
пропускаются. Существующие записи НЕ перезаписываются — добавляются
только новые. Если нужно обновить тексты/фото — SQL-ом, не здесь.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import psycopg

BATCH = 5_000


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--group", required=True, help="VK-группа, напр. grib_spb")
    ap.add_argument("--in", dest="in_path", required=True, help="raw_posts.json")
    ap.add_argument(
        "--dsn",
        default=os.getenv(
            "DATABASE_URL",
            "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map",
        ),
    )
    args = ap.parse_args()

    in_path = Path(args.in_path)
    if not in_path.exists():
        print(f"not found: {in_path}", file=sys.stderr)
        sys.exit(1)

    print(f"loading {in_path} ...")
    with open(in_path, encoding="utf-8") as f:
        posts = json.load(f)
    print(f"  {len(posts)} posts in file")

    conn = psycopg.connect(args.dsn)
    try:
        existing = conn.execute(
            "SELECT COUNT(*) FROM vk_post WHERE vk_group = %s",
            (args.group,),
        ).fetchone()[0]
        print(f"  {existing} posts already in DB for vk_group={args.group!r}")

        # COPY-batched insert (с ON CONFLICT не получится — используем executemany).
        # Для ~50k постов executemany через psycopg3 приемлемо.
        rows = []
        skipped_malformed = 0
        for p in posts:
            pid = p.get("id")
            ts = p.get("date_ts")
            if pid is None or ts is None:
                skipped_malformed += 1
                continue
            # date_ts от parser'а — unix timestamp (секунды UTC)
            dt = datetime.fromtimestamp(int(ts), tz=timezone.utc)
            rows.append((
                args.group,
                int(pid),
                dt,
                p.get("text", "") or "",
                int(p.get("likes", 0) or 0),
                int(p.get("reposts", 0) or 0),
                int(p.get("views", 0)) if p.get("views") is not None else None,
                p.get("photo_urls", []) or [],
            ))

        if skipped_malformed:
            print(f"  skipped {skipped_malformed} malformed rows")

        inserted = 0
        for i in range(0, len(rows), BATCH):
            chunk = rows[i : i + BATCH]
            with conn.cursor() as cur:
                cur.executemany(
                    """
                    INSERT INTO vk_post
                      (vk_group, post_id, date_ts, text, likes, reposts,
                       views, photo_urls)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (vk_group, post_id) DO NOTHING
                    """,
                    chunk,
                )
            conn.commit()
            inserted += len(chunk)
            print(f"  committed {inserted}/{len(rows)} posts...")

        final = conn.execute(
            "SELECT COUNT(*) FROM vk_post WHERE vk_group = %s",
            (args.group,),
        ).fetchone()[0]
        print(f"done. vk_post rows for {args.group!r}: {existing} -> {final} (+{final - existing})")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
