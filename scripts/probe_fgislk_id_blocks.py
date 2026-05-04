#!/usr/bin/env python
"""
probe_fgislk_id_blocks.py — поиск object_id блоков других кадастровых
районов Ленобласти (47:14:, 47:01:, ...) в FGIS object_id space.

История:
  - 2026-05-04 первый прогон scrape_fgislk_attrinfo.py с диапазоном
    109,022,831..109,118,831 захватил ОДИН кадастровый район ЛО
    (47:15:) — 82k выделов, 2400 км².
  - Юзер ткнул в выдел 47:14:14:44:28 на ФГИС, оказалось — в нашем
    блоке его НЕТ. Значит 47:14: и другие cadastral-районы ЛО живут в
    других ID-диапазонах.

Скрипт делает coarse-probe (`step` IDs за раз, default 1000) по широкому
диапазону, собирает cadastral-префиксы (`47:NN`, `10:NN`, etc.) и пишет
гистограмму. После этого — visually видно где `47:NN` для разных NN.

Использование:
  bash # VPN-off, RU IP
  .venv/Scripts/python.exe -u scripts/probe_fgislk_id_blocks.py \\
      --start 100000000 --end 130000000 --step 1000 --workers 30

Output:
  data/rosleshoz/probe_fgislk_blocks.tsv
    object_id\tcadastral_prefix\tcadastral_full

  + stdout summary: top-50 prefixes by count, expected 47:NN-clusters.
"""
from __future__ import annotations

import argparse
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# Re-use scraper's HTTP helpers via sys.path.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipelines"))
from scrape_fgislk_attrinfo import fetch_attrs  # noqa: E402


def cadastral_prefix(num: str) -> str:
    """`47:15:9:125:6` → `47:15`. Возвращает первые 2 уровня."""
    parts = num.split(":")
    if len(parts) >= 2:
        return f"{parts[0]}:{parts[1]}"
    return parts[0] if parts else ""


def probe_one(oid: int) -> tuple[int, str | None]:
    attrs = fetch_attrs(oid)
    if not attrs:
        return oid, None
    num = attrs.get("number") or ""
    return oid, num


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--start", type=int, default=100_000_000)
    p.add_argument("--end",   type=int, default=130_000_000)
    p.add_argument("--step",  type=int, default=1000)
    p.add_argument("--workers", type=int, default=30)
    p.add_argument("--out", default="data/rosleshoz/probe_fgislk_blocks.tsv")
    args = p.parse_args()

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    ids = list(range(args.start, args.end + 1, args.step))
    print(f"Probe range: {args.start:,} .. {args.end:,}  step={args.step}")
    print(f"Probes: {len(ids):,}  workers: {args.workers}")
    print()

    t0 = time.time()
    rows: list[tuple[int, str | None]] = []
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = [ex.submit(probe_one, oid) for oid in ids]
        for i, f in enumerate(as_completed(futs), 1):
            rows.append(f.result())
            if i % 200 == 0:
                dt = time.time() - t0
                rate = i / dt
                eta = (len(ids) - i) / rate if rate > 0 else 0
                print(f"  {i:>5}/{len(ids)}  {rate:.1f}/s  eta {eta/60:.1f}min")

    rows.sort(key=lambda r: r[0])

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("object_id\tprefix\tcadastral\n")
        for oid, num in rows:
            pre = cadastral_prefix(num) if num else ""
            f.write(f"{oid}\t{pre}\t{num or ''}\n")
    print(f"Wrote {out_path}  ({len(rows):,} rows)")
    print()

    # Summary: top prefixes
    counts = Counter(cadastral_prefix(num) for _, num in rows if num)
    print("Top-30 prefixes (count):")
    for pre, n in counts.most_common(30):
        marker = " ← LO" if pre.startswith("47:") else ""
        print(f"  {pre:>12}  {n:>5}{marker}")
    print()

    # 47:NN clusters — какие 47:NN блоки видны
    lo_prefixes = sorted({p for p in counts if p.startswith("47:")})
    print(f"LO cadastral-районов найдено: {lo_prefixes}")
    print()

    # Грубые границы каждого 47:NN в id-space
    print("Bounds per 47:NN prefix (min..max object_id из probe-выборки):")
    bounds: dict[str, tuple[int, int]] = {}
    for oid, num in rows:
        if not num or not num.startswith("47:"):
            continue
        pre = cadastral_prefix(num)
        if pre in bounds:
            lo, hi = bounds[pre]
            bounds[pre] = (min(lo, oid), max(hi, oid))
        else:
            bounds[pre] = (oid, oid)
    for pre in sorted(bounds):
        lo, hi = bounds[pre]
        print(f"  {pre}:  {lo:>11,} .. {hi:>11,}  (span {hi - lo:,})")


if __name__ == "__main__":
    main()
