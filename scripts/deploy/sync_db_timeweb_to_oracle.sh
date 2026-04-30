#!/usr/bin/env bash
# Daily DB sync: TimeWeb (primary RU) -> Oracle (foreign replica).
# Запускается на TimeWeb VM через systemd-таймер geobiom-db-sync.timer.
#
# Stack контракт (см. CLAUDE.md «Production стек: two-stack»):
#   - TimeWeb = master, principal source of truth для public.* schema
#   - Oracle  = full replica для VPN/foreign юзеров; clobber-and-restore
#               nightly. Допустимая stale 24h.
#
# Pipeline:
#   docker exec mushroom_db_prod pg_dump -Fc | ssh oracle | pg_restore
#
# Перед restore'ом останавливаем mushroom_api_prod на Oracle чтобы pg_restore
# не упёрся в активные connections (--clean дропает таблицы; pool API
# держит конн → блокировка). После restore — поднимаем.
#
# Логи в stdout (systemd собирает в journalctl).
#
# Зависимости:
#   - /root/.ssh/sync_to_oracle (private key, no passphrase, only for sync)
#   - public part в Oracle ~ubuntu/.ssh/authorized_keys
#   - mushroom_db_prod контейнер запущен на обеих VM
#   - .env.prod на TimeWeb с POSTGRES_USER/POSTGRES_DB

set -euo pipefail

ORACLE_SSH=${ORACLE_SSH:-ubuntu@79.76.46.181}
ORACLE_KEY=${ORACLE_KEY:-/root/.ssh/sync_to_oracle}
ORACLE_COMPOSE_DIR=${ORACLE_COMPOSE_DIR:-/srv/mushroom-map}
LOCAL_COMPOSE_DIR=${LOCAL_COMPOSE_DIR:-/srv/mushroom-map}

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

cd "$LOCAL_COMPOSE_DIR"

# Достаём DB-creds из контейнера (не читаем .env.prod чтобы не светить
# pwd в логах). pg_dump'у достаточно $POSTGRES_USER/$POSTGRES_DB которые
# уже в env'е контейнера.
DB_USER=$(docker exec mushroom_db_prod sh -c 'echo $POSTGRES_USER')
DB_NAME=$(docker exec mushroom_db_prod sh -c 'echo $POSTGRES_DB')
[[ -n "$DB_USER" && -n "$DB_NAME" ]] || { log "FATAL: cannot read DB creds from container"; exit 1; }

log "starting sync $DB_NAME -> $ORACLE_SSH"

ssh_oracle() {
    ssh -i "$ORACLE_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "$ORACLE_SSH" "$@"
}

# 1. Stop API на Oracle (и обсервабилити если запущен).
log "stopping Oracle api container"
ssh_oracle "cd $ORACLE_COMPOSE_DIR && docker compose -f docker-compose.prod.yml --env-file .env.prod stop api 2>&1 | tail -3"

# Trap чтобы api поднялся даже если pg_restore упадёт.
restore_api() {
    log "restarting Oracle api container"
    ssh_oracle "cd $ORACLE_COMPOSE_DIR && docker compose -f docker-compose.prod.yml --env-file .env.prod start api 2>&1 | tail -3" || true
}
trap restore_api EXIT

# 2. pg_dump | ssh | pg_restore.
log "pg_dump | ssh | pg_restore (this can take 10+ min for ~2M forest rows)"
START=$(date -u +%s)

# pg_dump в кастомном формате (-Fc), сжатие средне (-Z 6 — баланс между
# CPU и сетью). --no-owner --no-acl чтобы не тащить TimeWeb-specific роли.
docker exec mushroom_db_prod pg_dump \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        -Fc -Z 6 \
        --no-owner --no-acl \
    | ssh_oracle \
        "docker exec -i mushroom_db_prod pg_restore \
            --clean --if-exists \
            --no-owner --no-acl \
            --exit-on-error \
            -U $DB_USER -d $DB_NAME 2>&1 | grep -vE 'already exists|does not exist|skipping' | tail -50"

DURATION=$(( $(date -u +%s) - START ))
log "pg_restore done in ${DURATION}s"

# Sanity-чек: пробуем посчитать строки в forest_polygon на Oracle.
COUNT=$(ssh_oracle "docker exec mushroom_db_prod psql -U $DB_USER -d $DB_NAME -tAc 'SELECT COUNT(*) FROM forest_polygon'" 2>/dev/null || echo "0")
log "Oracle forest_polygon count: $COUNT"
[[ "$COUNT" -ge 1000000 ]] || { log "WARN: forest_polygon count ($COUNT) ниже ожидаемого ~2M. Проверить вручную."; }

# 3. trap restore_api поднимет API на выходе.
log "sync OK"
