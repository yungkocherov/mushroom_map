#!/usr/bin/env bash
# Disaster-recovery drill: pull latest backup from Y.O.S., decrypt with
# the local age private key, restore into a transient docker postgres,
# and assert minimum row counts. Without this drill passing, backups
# are not verified — see spec §1.
#
# Usage (dev machine):
#   YOS_BUCKET=geobiom-backups RCLONE_REMOTE=geobiom-yos \
#     AGE_KEY=$HOME/.ssh/geobiom-backup.age \
#     bash scripts/backup/restore_drill.sh
#
# Requires locally: docker, rclone (with [geobiom-yos] remote configured),
# age, the private key matching prod's AGE_RECIPIENT.

set -euo pipefail

ENV_FILE="${BACKUP_ENV_FILE:-./scripts/backup/.env.local}"
if [[ -r "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
fi

AGE_KEY="${AGE_KEY:-$HOME/.ssh/geobiom-backup.age}"
RCLONE_REMOTE="${RCLONE_REMOTE:-geobiom-yos}"
YOS_BUCKET="${YOS_BUCKET:?YOS_BUCKET required}"
DRILL_PORT="${DRILL_PORT:-55432}"
DRILL_NAME="${DRILL_NAME:-drill-pg}"

if [[ ! -f "$AGE_KEY" ]]; then
    echo "[drill] age private key missing: $AGE_KEY" >&2
    exit 1
fi
for cmd in docker rclone age; do
    command -v "$cmd" >/dev/null || { echo "[drill] missing $cmd" >&2; exit 1; }
done

WORK="$(mktemp -d)"
cleanup() {
    rm -rf "$WORK"
    docker rm -f "$DRILL_NAME" 2>/dev/null || true
}
trap cleanup EXIT

echo "[drill] listing latest backup in ${RCLONE_REMOTE}:${YOS_BUCKET}/db/"
LATEST=$(rclone lsf "${RCLONE_REMOTE}:${YOS_BUCKET}/db/" 2>/dev/null | sort | tail -1)
if [[ -z "$LATEST" ]]; then
    echo "[drill] no backups found" >&2
    exit 1
fi
echo "[drill] latest: $LATEST"

echo "[drill] downloading + decrypting"
rclone copyto "${RCLONE_REMOTE}:${YOS_BUCKET}/db/${LATEST}" "$WORK/dump.age"
age -d -i "$AGE_KEY" -o "$WORK/dump.bin" "$WORK/dump.age"
echo "[drill] dump size: $(du -h "$WORK/dump.bin" | cut -f1)"

echo "[drill] starting transient postgres on :${DRILL_PORT}"
docker rm -f "$DRILL_NAME" 2>/dev/null || true
docker run -d --name "$DRILL_NAME" \
    -e POSTGRES_USER=mushroom \
    -e POSTGRES_PASSWORD=drill \
    -e POSTGRES_DB=mushroom_map \
    -p "${DRILL_PORT}:5432" \
    postgis/postgis:16-3.4 >/dev/null

# Wait for postgres to be ready (max 60 s).
for _ in $(seq 1 60); do
    if docker exec "$DRILL_NAME" pg_isready -U mushroom >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

echo "[drill] pg_restore"
docker cp "$WORK/dump.bin" "$DRILL_NAME":/tmp/dump.bin
# pg_restore exit code 1 includes "non-fatal warnings" (e.g. role-not-found
# from --no-owner). We accept stderr noise but check actual data afterwards.
docker exec "$DRILL_NAME" pg_restore --no-owner --no-acl \
    -U mushroom -d mushroom_map /tmp/dump.bin || true

echo "[drill] asserting row counts"
fail=0
assert() {
    local table="$1" min="$2"
    local n
    n=$(docker exec "$DRILL_NAME" psql -U mushroom -d mushroom_map -At \
        -c "SELECT count(*) FROM ${table}" 2>/dev/null || echo 0)
    n="${n//[!0-9]/}"
    if [[ -z "$n" ]] || (( n < min )); then
        echo "  FAIL  ${table}: ${n:-0} < ${min}" >&2
        fail=1
    else
        echo "  OK    ${table}: ${n} >= ${min}"
    fi
}

# Minimum row counts. Бэкап-режим определяется наличием INCLUDE_TABLES в
# .env.backup (partial — только irreducible: users + spots + refresh-tokens
# + vk_post; full — всё). Ассерты ниже выбираются под partial-режим
# (текущий default). Для full-дампа поднять пороги через MIN_FOREST_POLYGON
# и т. п. env-vars.
assert users "${MIN_USERS:-1}"
assert user_spot "${MIN_USER_SPOT:-0}"
assert user_refresh_token "${MIN_USER_REFRESH:-0}"
# Если full-режим (forest_polygon в дампе) — поверяем тоже. В partial
# таблица не приедет, и `assert forest_polygon` упадёт — поэтому только
# когда явно ожидаем full.
if [[ "${EXPECT_FULL:-0}" == "1" ]]; then
    assert forest_polygon "${MIN_FOREST_POLYGON:-2000000}"
    assert admin_area "${MIN_ADMIN_AREA:-18}"
    assert vk_post "${MIN_VK_POST:-0}"
fi

if (( fail )); then
    echo "[drill] FAIL"
    exit 1
fi
echo "[drill] PASS"
