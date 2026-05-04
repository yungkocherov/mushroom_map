#!/usr/bin/env bash
# sync_forest_polygon_to_remote.sh — точечный sync ТОЛЬКО forest_polygon
# (как table-data) на удалённую VM. Не трогает user_spot, oauth_user,
# species, и прочие таблицы.
#
# Зачем: sync_db_to_remote.sh делает --clean (drop all tables), что
# уносит user_spot и прочие user-data. Когда нужно только обновить
# forest_polygon (после нового rosleshoz-scrape) — этот скрипт.
#
# Использование (предполагается local docker postgres mushroom_db):
#   REMOTE=geobiom-prod-timeweb bash scripts/deploy/sync_forest_polygon_to_remote.sh
#
# Опции через env:
#   REMOTE   — обязательно, ssh-target
#   SOURCE   — фильтр source-поля для replace (default: rosleshoz; '' = все)
#   LOCAL_CONTAINER  — local docker container с БД (default: mushroom_db)
#   REMOTE_CONTAINER — prod docker container (default: mushroom_db_prod)
#   REMOTE_HOST_DIR  — куда scp дамп на VM (default: /tmp)

set -euo pipefail

REMOTE="${REMOTE:?Set REMOTE=geobiom-prod-timeweb}"
SOURCE="${SOURCE:-rosleshoz}"
LOCAL_CONTAINER="${LOCAL_CONTAINER:-mushroom_db}"
REMOTE_CONTAINER="${REMOTE_CONTAINER:-mushroom_db_prod}"
REMOTE_HOST_DIR="${REMOTE_HOST_DIR:-/tmp}"

TS="$(date +%Y%m%d-%H%M%S)"
LOCAL_CSV="/tmp/forest_polygon_${SOURCE:-all}_${TS}.csv"
LOCAL_CSV_GZ="${LOCAL_CSV}.gz"
REMOTE_CSV_GZ="${REMOTE_HOST_DIR}/$(basename "$LOCAL_CSV_GZ")"
REMOTE_CSV="${REMOTE_HOST_DIR}/$(basename "$LOCAL_CSV")"

# Filter clause для psql query
if [ -n "$SOURCE" ]; then
    WHERE="WHERE source = '${SOURCE}'"
else
    WHERE=""
fi

echo "[1/5] dump local forest_polygon $WHERE"
docker exec "$LOCAL_CONTAINER" psql -U mushroom -d mushroom_map -c "
    \\copy (SELECT * FROM forest_polygon $WHERE) TO STDOUT WITH (FORMAT csv, HEADER true)
" > "$LOCAL_CSV"
SZ=$(du -h "$LOCAL_CSV" | cut -f1)
echo "      $LOCAL_CSV  ($SZ)"
gzip -f "$LOCAL_CSV"
SZ_GZ=$(du -h "$LOCAL_CSV_GZ" | cut -f1)
echo "      gzipped: $SZ_GZ"

echo "[2/5] scp -> $REMOTE:$REMOTE_CSV_GZ"
scp -C "$LOCAL_CSV_GZ" "$REMOTE:$REMOTE_CSV_GZ"

echo "[3/5] gunzip + docker cp на VM"
ssh "$REMOTE" "
    set -e
    gunzip -f '$REMOTE_CSV_GZ'
    docker cp '$REMOTE_CSV' '$REMOTE_CONTAINER:/tmp/forest_polygon.csv'
"

echo "[4/5] DELETE + COPY в prod-DB (transactional)"
ssh "$REMOTE" "docker exec -i '$REMOTE_CONTAINER' psql -U mushroom -d mushroom_map -v ON_ERROR_STOP=1 <<SQL
BEGIN;
DELETE FROM forest_polygon ${WHERE};
\\copy forest_polygon FROM '/tmp/forest_polygon.csv' WITH (FORMAT csv, HEADER true);
COMMIT;
SQL"

echo "[5/5] cleanup"
ssh "$REMOTE" "docker exec '$REMOTE_CONTAINER' rm -f /tmp/forest_polygon.csv; rm -f '$REMOTE_CSV'"
rm -f "$LOCAL_CSV_GZ"

echo
echo "Done. Smoke check:"
echo "  ssh $REMOTE \"docker exec $REMOTE_CONTAINER psql -U mushroom -d mushroom_map -c \\\"SELECT source, count(*) FROM forest_polygon GROUP BY source;\\\"\""
