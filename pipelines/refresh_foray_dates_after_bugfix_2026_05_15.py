"""
One-off: re-extract foray_date для всех vk_post с date_source='regex'
после fix bug «месяц YYYY» (см. ingest_vk.py:368 коммит 2026-05-15).

Bug: старый regex `{MONTHS_RU}\s+(\d{1,2})(?:\s+(\d{4}))?` на тексте
"сентябрь 2020 г" парсил "20" как DD, year fallback'ил на post_dt.year.
Это давало WRONG-year даты (lag 31-365d bucket ~10% в check скрипте).

Стратегия:
  1. SELECT id, text, date_ts, foray_date FROM vk_post
     WHERE date_source='regex' AND foray_date IS NOT NULL
  2. Для каждой row: new = parse_date_regex(text, post_dt) [FIXED code]
  3. Сравнить с old foray_date. Если разные → накопить в updates.
  4. --dry-run: распечатать summary table, не UPDATE.
  5. --commit: UPDATE vk_post SET foray_date = new WHERE id = old.

Run:
  .venv/Scripts/python.exe pipelines/refresh_foray_dates_after_bugfix_2026_05_15.py --dry-run
  .venv/Scripts/python.exe pipelines/refresh_foray_dates_after_bugfix_2026_05_15.py --commit
"""

from __future__ import annotations

import argparse
import os
import random
import sys
from collections import Counter
from datetime import date
from pathlib import Path

import psycopg
from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).parent))
from ingest_vk import parse_date_regex  # noqa: E402

DSN = os.environ.get(
    "DATABASE_URL",
    "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map",
)


def main() -> int:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true", help="show changes, no DB write")
    g.add_argument("--commit", action="store_true", help="UPDATE rows in DB")
    ap.add_argument("--limit", type=int, default=None, help="cap rows scanned")
    ap.add_argument("--seed", type=int, default=20260515,
                    help="random seed for `месяц YYYY` без-дня случаев")
    args = ap.parse_args()

    random.seed(args.seed)

    with psycopg.connect(DSN) as conn:
        sql = """
            SELECT id, date_ts, text, foray_date
            FROM vk_post
            WHERE date_source = 'regex' AND foray_date IS NOT NULL
            ORDER BY id
        """
        params: list = []
        if args.limit:
            sql += " LIMIT %s"
            params.append(args.limit)

        rows = conn.execute(sql, params).fetchall()
        print(f"  candidates: {len(rows)} posts with date_source='regex'")

        updates: list[tuple[date | None, int]] = []
        category = Counter()
        sample_changes = []

        for pk, date_ts, text, old_foray in tqdm(rows, desc="re-extract", unit="post"):
            post_dt = date_ts.date()
            new_foray = parse_date_regex(text or "", post_dt)
            if new_foray == old_foray:
                category["unchanged"] += 1
                continue
            if new_foray is None:
                category["regex_to_none"] += 1
            elif old_foray is None:
                category["none_to_regex"] += 1
            elif new_foray.year != old_foray.year:
                category["year_changed"] += 1
            elif new_foray.month != old_foray.month:
                category["month_changed"] += 1
            else:
                category["day_changed_only"] += 1
            updates.append((new_foray, pk))
            if len(sample_changes) < 15:
                sample_changes.append((pk, old_foray, new_foray,
                                       (text or "")[:80].replace("\n", " ")))

        print()
        print("  === SUMMARY ===")
        for k, v in sorted(category.items(), key=lambda kv: -kv[1]):
            print(f"    {k:>22}: {v}")
        print(f"  total changes:           {len(updates)}")
        print()
        print("  === SAMPLE CHANGES (max 15) ===")
        for pk, old_f, new_f, snippet in sample_changes:
            print(f"    id={pk:>7} {old_f} -> {new_f}  | {snippet}")

        if args.dry_run:
            print()
            print("  DRY-RUN — no UPDATE issued.")
            return 0

        if not updates:
            print("  Nothing to update.")
            return 0

        print()
        print(f"  Applying {len(updates)} UPDATEs...")
        with conn.cursor() as cur:
            cur.executemany(
                "UPDATE vk_post SET foray_date = %s WHERE id = %s",
                updates,
            )
        conn.commit()
        print(f"  done: {len(updates)} rows updated.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
