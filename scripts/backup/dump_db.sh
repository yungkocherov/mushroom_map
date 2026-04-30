#!/usr/bin/env bash
# Nightly Postgres dump → age-encrypted → Yandex Object Storage.
# Reads /etc/geobiom/.env.backup. Driven by geobiom-backup.timer.
#
# Pure stream pipeline — no temp file on disk:
#   docker exec pg_dump | age -r $AGE_RECIPIENT | rclone rcat
#
# Exit codes:
#   0  success
#   1  env / dependency missing
#   2  pipeline failure (set -o pipefail catches any stage)

set -euo pipefail

ENV_FILE="${BACKUP_ENV_FILE:-/etc/geobiom/.env.backup}"
if [[ -r "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$SCRIPT_DIR/check_env.sh"

PG_CONTAINER="${PG_CONTAINER:-mushroom_db_prod}"
RCLONE_REMOTE="${RCLONE_REMOTE:-geobiom-yos}"
DATE_UTC="$(date -u +%F)"
KEY="db/${DATE_UTC}.sql.gz.age"

start_ts="$(date +%s)"
echo "[backup] start ${DATE_UTC} -> ${RCLONE_REMOTE}:${YOS_BUCKET}/${KEY}"

# pipefail catches a failure in any stage. -Z 9 = max compression
# (slower CPU but smaller upload; net-bound so worth it).
docker exec -i "$PG_CONTAINER" pg_dump \
        -U "$POSTGRES_USER" \
        -d "$POSTGRES_DB" \
        --format=custom \
        -Z 9 \
        --no-owner \
        --no-acl \
    | age -r "$AGE_RECIPIENT" \
    | rclone rcat "${RCLONE_REMOTE}:${YOS_BUCKET}/${KEY}"

dur=$(( $(date +%s) - start_ts ))

# rclone size --json -> {"count":1,"bytes":12345}. Best-effort,
# don't fail the backup if reporting fails.
size=$(rclone size --json "${RCLONE_REMOTE}:${YOS_BUCKET}/${KEY}" 2>/dev/null \
       | grep -oE '"bytes":[0-9]+' | grep -oE '[0-9]+' || echo 0)

echo "[backup] done in ${dur}s, ${size} bytes"
