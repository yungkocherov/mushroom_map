#!/usr/bin/env bash
# Phase 3 of prod-readiness migration: cutover prod stack onto Oracle VM.
# TimeWeb остаётся живым — DNS не трогаем здесь. Это перенос данных
# и поднятие стека на новой VM, без публичного переключения.
#
# Pre-conditions:
#   - Oracle VM bootstrapped (scripts/deploy/bootstrap_oracle.sh).
#   - Tailscale up на обеих VM + dev-машине; alias geobiom-prod (Oracle)
#     и geobiom-prod-timeweb (TimeWeb) в ~/.ssh/config.
#   - .env.prod на Oracle заполнен.
#   - Phase 0 backup pipeline жив на TimeWeb, последний backup в Y.O.S.
#     не старше 24 ч.
#   - Локально: rclone с remote `geobiom-yos` сконфигурён, age приватный
#     ключ доступен.
#
# Usage:
#   ORACLE_HOST=geobiom-prod \
#   TIMEWEB_HOST=geobiom-prod-timeweb \
#   AGE_KEY=$HOME/.ssh/geobiom-backup.age \
#     bash scripts/deploy/cutover_to_oracle.sh

set -euo pipefail

ORACLE_HOST="${ORACLE_HOST:?Set ORACLE_HOST=geobiom-prod (tailnet name)}"
TIMEWEB_HOST="${TIMEWEB_HOST:?Set TIMEWEB_HOST=geobiom-prod-timeweb}"
AGE_KEY="${AGE_KEY:-$HOME/.ssh/geobiom-backup.age}"
RCLONE_REMOTE="${RCLONE_REMOTE:-geobiom-yos}"
YOS_BUCKET="${YOS_BUCKET:-geobiom-backups}"

[[ -f "$AGE_KEY" ]] || { echo "age key missing: $AGE_KEY" >&2; exit 1; }
for cmd in rclone age ssh scp rsync; do
    command -v "$cmd" >/dev/null || { echo "missing: $cmd" >&2; exit 1; }
done

echo "[1/8] sanity: ssh ping обе стороны"
ssh -o ConnectTimeout=5 "$ORACLE_HOST"  true || { echo "Oracle unreachable" >&2; exit 1; }
ssh -o ConnectTimeout=5 "$TIMEWEB_HOST" true || { echo "TimeWeb unreachable" >&2; exit 1; }

echo "[2/8] /srv/mushroom-map prep на Oracle"
ssh "$ORACLE_HOST" '
    set -e
    cd /srv/mushroom-map
    git pull --ff-only origin main
    test -f .env.prod || { echo ".env.prod не найден на Oracle" >&2; exit 1; }
    mkdir -p data/tiles data/copernicus/terrain
'

echo "[3/8] pull latest backup из Y.O.S. → decrypt"
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
LATEST=$(rclone lsf "${RCLONE_REMOTE}:${YOS_BUCKET}/db/" | sort | tail -1)
[[ -n "$LATEST" ]] || { echo "no backups in Y.O.S." >&2; exit 1; }
echo "  latest: $LATEST"
rclone copyto "${RCLONE_REMOTE}:${YOS_BUCKET}/db/${LATEST}" "$WORK/dump.age"
age -d -i "$AGE_KEY" -o "$WORK/dump.bin" "$WORK/dump.age"
echo "  decrypted size: $(du -h "$WORK/dump.bin" | cut -f1)"

echo "[4/8] scp dump на Oracle"
scp -C "$WORK/dump.bin" "$ORACLE_HOST:/tmp/dump.bin"

echo "[5/8] up db on Oracle + pg_restore + observability roles"
ssh "$ORACLE_HOST" bash -s <<'REMOTE_EOF'
set -e
cd /srv/mushroom-map
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d db
# Wait for healthy
for _ in $(seq 1 60); do
    if docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db \
            pg_isready -U mushroom >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

docker cp /tmp/dump.bin mushroom_db_prod:/tmp/dump.bin
# pg_restore с --clean дропает существующие таблицы (на свежей БД
# безопасно). --no-owner --no-acl оставляют owner = mushroom.
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db \
    pg_restore --clean --if-exists --no-owner --no-acl \
    -U mushroom -d mushroom_map /tmp/dump.bin || true

docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db rm -f /tmp/dump.bin
rm -f /tmp/dump.bin

# Создать роли + БД для observability стека (idempotent через DO-блок).
# Пароли берутся из .env.prod, который уже загружен compose'ом.
GLITCHTIP_PW=$(grep ^GLITCHTIP_DB_PASSWORD .env.prod | cut -d= -f2-)
UMAMI_PW=$(grep ^UMAMI_DB_PASSWORD .env.prod | cut -d= -f2-)
if [[ -n "$GLITCHTIP_PW" && -n "$UMAMI_PW" ]]; then
    docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db \
        psql -U mushroom -d mushroom_map -v ON_ERROR_STOP=0 <<SQL
DO \$\$ BEGIN
    CREATE ROLE glitchtip LOGIN PASSWORD '$GLITCHTIP_PW';
EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
SELECT 'CREATE DATABASE glitchtip OWNER glitchtip'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'glitchtip')\gexec

DO \$\$ BEGIN
    CREATE ROLE umami LOGIN PASSWORD '$UMAMI_PW';
EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
SELECT 'CREATE DATABASE umami OWNER umami'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'umami')\gexec
SQL
    echo "  observability roles + databases ensured"
else
    echo "  (skip obs roles: GLITCHTIP_DB_PASSWORD / UMAMI_DB_PASSWORD не заданы в .env.prod)"
fi
REMOTE_EOF

echo "[6/8] rsync tiles TimeWeb → dev → Oracle (через tailnet)"
# Двух-этапный rsync через dev: TimeWeb → /tmp/oracle-tiles → Oracle.
# Прямой VM-to-VM требует ssh-key TimeWeb на Oracle, не хочется.
TILES_TMP=$(mktemp -d); trap 'rm -rf "$WORK" "$TILES_TMP"' EXIT
echo "  pull from TimeWeb"
rsync -avh --info=progress2 \
    "$TIMEWEB_HOST:/srv/mushroom-map/tiles/" "$TILES_TMP/"
echo "  push to Oracle"
ssh "$ORACLE_HOST" 'mkdir -p /srv/mushroom-map/tiles'
rsync -avh --info=progress2 \
    "$TILES_TMP/" "$ORACLE_HOST:/srv/mushroom-map/tiles/"

echo "[7/8] up full stack на Oracle (api + caddy + glitchtip + umami)"
ssh "$ORACLE_HOST" bash -s <<'REMOTE_EOF'
set -e
cd /srv/mushroom-map
export GIT_SHA=$(git rev-parse HEAD)

# Поднять основной стек.
docker compose -f docker-compose.prod.yml --env-file .env.prod pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Применить миграции (idempotent через schema_migrations).
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T api \
    python /app/db/migrate.py

# Поднять observability оверлеи если их env-файлы заполнены.
if [[ -f services/observability/glitchtip/.env && -f services/observability/umami/.env ]]; then
    docker compose -f docker-compose.prod.yml \
                   -f services/observability/glitchtip/docker-compose.yml \
                   -f services/observability/umami/docker-compose.yml \
                   --env-file .env.prod up -d
else
    echo "  (skip observability: env-files не настроены — см. services/observability/README.md)"
fi
REMOTE_EOF

echo "[8/8] smoke-test через tailnet"
bash "$(dirname "$0")/smoke_test_prod.sh" "$ORACLE_HOST"

cat <<NEXT

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Cutover stage 3 done. Дальнейшие шаги:

  1. (за 24 ч до DNS-flip) bash scripts/deploy/cloudflare_set_ttl.sh
     — опускает TTL до 300 на geobiom A-records, чтобы rollback был быстрым.

  2. NEW_IP=<oracle-public-ip> bash scripts/deploy/cloudflare_dns_cutover.sh
     — переключает A-записи на Oracle.

  3. Через ~5 мин: bash scripts/deploy/smoke_test_prod.sh geobiom.ru
     с PROTO=https HTTPS_HOST=geobiom.ru — финальная проверка.

  4. Soak 7 дней. Если что — bash scripts/deploy/rollback_to_timeweb.sh.

  5. После soak'а: bash scripts/deploy/decommission_timeweb.sh.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEXT
