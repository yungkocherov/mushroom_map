#!/usr/bin/env bash
# scrape_lo_full.sh — полный rescrape всех найденных 47:NN dense
# блоков ЛО с verify-externalid logic (commit 77d5904).
#
# Probes (v2 step=100, v3 step=1000) нашли 11 dense ID-блоков
# по разным cadastral-районам ЛО.
#
# Total ~1.77M IDs. ETA ~12-15h при workers=30 + verify-retry overhead.
#
# progress.db общая — статус сохраняется per object_id, можно перезапустить
# после crash без потери прогресса.

set -euo pipefail

SCRAPER='.venv/Scripts/python.exe -u pipelines/scrape_fgislk_attrinfo.py'
LOG="logs/scrape_lo_full.log"
exec > >(tee -a "$LOG") 2>&1

echo "=== START $(date) ==="

# Маленькие блоки сначала — early validation.
declare -a RANGES=(
    "47:19   107490000  107515000"
    "47:17    64955000   65005000"
    "47:10    64360000   64420000"
    "47:8     64178000   64216000"
    "47:7     64120000   64180000"
    "47:4     71980000   72040000"
    "47:12   100360000  100425000"
    "47:2     63625000   63700000"
    "47:1     57140000   57250000"
    "47:6    104145000  104260000"
    "47:9     64218000   64360000"
    "47:18    62435000   62615000"
    "47:11    64430000   64635000"
    "47:13   113850000  114055000"
    "47:3     63705000   63920000"
    "47:15   109022000  109120000"
)

for entry in "${RANGES[@]}"; do
    read prefix start end <<< "$entry"
    echo
    echo "--- $prefix range $start..$end ($(( (end - start) / 1000 ))k IDs) ---"
    $SCRAPER --start "$start" --end "$end" --workers 30 --region-prefix 47:
done

echo
echo "=== END $(date) ==="
echo "Final progress.db status:"
.venv/Scripts/python.exe -c "
import sqlite3
c = sqlite3.connect('data/rosleshoz/fgislk_attrinfo_progress.db')
for s, n in c.execute('SELECT status, count(*) FROM done GROUP BY status ORDER BY 2 DESC'):
    print(f'  {s}: {n}')
"
