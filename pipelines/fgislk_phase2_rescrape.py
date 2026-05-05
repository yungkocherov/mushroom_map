"""
Phase-2 driver: после grid-sweep собрать union(new_ids, wrong_region) и
запустить scrape с patched verify-policy (Phase 0).

ВЫХОД:
  data/rosleshoz/phase2_union_ids.txt  — список IDs для рескрейпа
  + продолжает писать в существующий progress.db
  + после успеха печатает next-step команду

ЛОГИКА:
  - new_ids       = grid-discovered IDs которых нет в progress.db
                    (или есть со статусом 'empty' — overwrite не нужен)
  - wrong_region  = IDs со статусом 'wrong_region' (Phase-0 patch их
                    больше не drop'ает — повторно прогоняем все)
  - union         = new_ids ∪ wrong_region

ПРИМЕЧАНИЕ:
  Перед запуском убедиться что fgislk_grid_discovery.db готов
  (т.е. fgislk_grid_sweep.py отработал).

ИСПОЛЬЗОВАНИЕ:
  .venv/Scripts/python.exe pipelines/fgislk_phase2_rescrape.py --dry-run
  .venv/Scripts/python.exe pipelines/fgislk_phase2_rescrape.py --workers 30
"""
from __future__ import annotations

import argparse
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GRID_DB = ROOT / "data/rosleshoz/fgislk_grid_discovery.db"
PROGRESS_DB = ROOT / "data/rosleshoz/fgislk_attrinfo_progress.db"
UNION_FILE = ROOT / "data/rosleshoz/phase2_union_ids.txt"


def collect_ids() -> tuple[set[int], set[int], set[int]]:
    """Returns (grid_ids, wrong_region_ids, union_ids)."""
    if not GRID_DB.exists():
        sys.exit(f"FATAL: grid_discovery.db missing — run fgislk_grid_sweep.py first ({GRID_DB})")
    if not PROGRESS_DB.exists():
        sys.exit(f"FATAL: progress.db missing ({PROGRESS_DB})")

    grid_conn = sqlite3.connect(GRID_DB)
    grid_ids = {
        r[0] for r in grid_conn.execute(
            "SELECT DISTINCT object_id FROM grid WHERE object_id IS NOT NULL"
        )
    }
    grid_conn.close()

    prog_conn = sqlite3.connect(PROGRESS_DB)
    wrong_region_ids = {
        r[0] for r in prog_conn.execute(
            "SELECT object_id FROM done WHERE status='wrong_region'"
        )
    }
    # ID's уже успешно отмеченные ok — пропускаем (есть фича + геом).
    ok_ids = {
        r[0] for r in prog_conn.execute(
            "SELECT object_id FROM done WHERE status='ok'"
        )
    }
    prog_conn.close()

    # New: те grid-IDs которых нет в done (ни ok, ни wrong_region, ни empty)
    # Берём всё что не ok — даже если status='empty', патченный scraper
    # может найти геом (Phase-0 fix). 'wrong_region' уже включены отдельно.
    new_ids = grid_ids - ok_ids
    union = new_ids | wrong_region_ids
    return grid_ids, wrong_region_ids, union


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true", help="Только вывести стат, не запускать scrape")
    p.add_argument("--workers", type=int, default=30)
    p.add_argument("--limit", type=int, default=None, help="Smoke: только N IDs")
    args = p.parse_args()

    grid_ids, wr_ids, union = collect_ids()
    print(f"Grid-discovered IDs:    {len(grid_ids):,}")
    print(f"Wrong-region IDs (DB):  {len(wr_ids):,}")
    print(f"Union to rescrape:      {len(union):,}")

    UNION_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(UNION_FILE, "w", encoding="utf-8") as f:
        for oid in sorted(union):
            f.write(f"{oid}\n")
    print(f"\nWrote union -> {UNION_FILE}")

    if args.dry_run:
        print("\n--dry-run: not invoking scraper.")
        print("Next: .venv/Scripts/python.exe pipelines/scrape_fgislk_attrinfo.py "
              f"--ids-file {UNION_FILE} --workers {args.workers}")
        return

    # IMPORTANT: rerun_wrong_region чтобы патченный сейв перезаписал старые
    # wrong_region записи. Без флага старые записи в `done` set'е блокируют
    # повторную обработку.
    cmd = [
        sys.executable,
        "-u",
        str(ROOT / "pipelines/scrape_fgislk_attrinfo.py"),
        "--ids-file", str(UNION_FILE),
        "--workers", str(args.workers),
        "--rerun-wrong-region",
    ]
    if args.limit:
        cmd += ["--limit", str(args.limit)]
    print(f"\nRunning: {' '.join(cmd)}")
    print()
    subprocess.run(cmd, cwd=str(ROOT), check=True, env=os.environ.copy())


if __name__ == "__main__":
    main()
