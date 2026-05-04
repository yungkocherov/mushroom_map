#!/usr/bin/env bash
# Sequential scrape of newly-discovered 47:NN cadastral blocks.
# Probe v2 (step=100, 100M..115M) found these dense blocks beyond our
# original 47:15 range. Total ~400k IDs at workers=30 ≈ 3-4 hours.
set -euo pipefail
SCRAPER='.venv/Scripts/python.exe -u pipelines/scrape_fgislk_attrinfo.py'
LOG=logs/scrape_lo_blocks.log
exec > >(tee -a "$LOG") 2>&1

echo "=== START $(date) ==="
# 47:19 first — smallest, fastest sanity check
echo "--- 47:19 ---"
$SCRAPER --start 107490000 --end 107513000 --workers 30 --region-prefix 47:
echo "--- 47:12 ---"
$SCRAPER --start 100360000 --end 100425000 --workers 30 --region-prefix 47:
echo "--- 47:6 ---"
$SCRAPER --start 104145000 --end 104260000 --workers 30 --region-prefix 47:
echo "--- 47:13 (largest) ---"
$SCRAPER --start 113850000 --end 114055000 --workers 30 --region-prefix 47:
echo "=== END $(date) ==="
