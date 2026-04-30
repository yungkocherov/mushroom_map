#!/usr/bin/env bash
# Apply retention policy to db/ prefix in Y.O.S. backup bucket.
#
# Policy:
#   - keep all backups from the last 7 days (daily)
#   - keep Sunday backups from the last 28 days (weekly, 4 entries)
#   - keep day-01 backups from the last 84 days (monthly, 3 entries)
#   - delete everything else
#
# Driven by geobiom-backup-rotate.timer (Sunday 04:00 UTC).

set -euo pipefail

ENV_FILE="${BACKUP_ENV_FILE:-/etc/geobiom/.env.backup}"
if [[ -r "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
fi

RCLONE_REMOTE="${RCLONE_REMOTE:-geobiom-yos}"
YOS_BUCKET="${YOS_BUCKET:?YOS_BUCKET required}"

today=$(date -u +%F)
week_ago=$(date -u -d "${today} - 7 days" +%F)
month_ago=$(date -u -d "${today} - 28 days" +%F)
quarter_ago=$(date -u -d "${today} - 84 days" +%F)

echo "[rotate] today=${today} week_ago=${week_ago} month_ago=${month_ago} quarter_ago=${quarter_ago}"

declare -a keep=()
declare -a delete=()

while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    # f looks like "2026-04-30.sql.gz.age"
    date_str="${f%%.sql.gz.age}"
    if [[ -z "$date_str" || "$date_str" == "$f" ]]; then
        # File doesn't match expected pattern — skip (don't delete unknown).
        continue
    fi

    # Validate it parses as a date.
    if ! date -u -d "$date_str" +%F >/dev/null 2>&1; then
        continue
    fi

    if [[ "$date_str" > "$week_ago" || "$date_str" == "$week_ago" ]]; then
        keep+=("$f")
    elif [[ "$date_str" > "$month_ago" || "$date_str" == "$month_ago" ]]; then
        # Weekly tier: keep Sundays (date -d ... +%u → 7 = Sunday).
        dow=$(date -u -d "$date_str" +%u)
        if [[ "$dow" == "7" ]]; then
            keep+=("$f")
        else
            delete+=("$f")
        fi
    elif [[ "$date_str" > "$quarter_ago" || "$date_str" == "$quarter_ago" ]]; then
        # Monthly tier: keep day-01.
        if [[ "$date_str" == *-01 ]]; then
            keep+=("$f")
        else
            delete+=("$f")
        fi
    else
        # Older than the quarterly window: delete.
        delete+=("$f")
    fi
done < <(rclone lsf "${RCLONE_REMOTE}:${YOS_BUCKET}/db/" 2>/dev/null | sort)

echo "[rotate] keep=${#keep[@]} delete=${#delete[@]}"
for f in "${delete[@]:-}"; do
    [[ -z "$f" ]] && continue
    echo "  - ${f}"
    rclone deletefile "${RCLONE_REMOTE}:${YOS_BUCKET}/db/${f}"
done
echo "[rotate] done"
