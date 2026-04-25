#!/usr/bin/env bash
# sync_db_to_remote.sh — однократный pg_dump локальной БД и pg_restore
# на удалённую VM. Запускается с локальной машины.
#
# Использование:
#   REMOTE=ubuntu@<vm-ip> bash scripts/deploy/sync_db_to_remote.sh
#
# Окружение:
#   LOCAL_DSN  (default: postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map)
#   REMOTE_DSN (default: postgresql://mushroom:mushroom_dev@127.0.0.1:5432/mushroom_map
#               — внутри prod-compose-сети это правильный DSN)
#   REMOTE     — ssh-target для прокидывания дампа (обязательно)
#
# Что делает:
#   1. pg_dump --format=custom -Fc локальной БД -> /tmp/mushroom-dump.bin
#   2. scp дампа на VM
#   3. ssh: docker compose exec -T db pg_restore --clean --if-exists ...
#
# Внимание: --clean дропает существующие таблицы в проде. Это безопасно
# на «свежеподнятой» БД, но НЕ на той, в которой уже есть данные. Для
# инкрементальных переносов нужен другой инструмент (логическая
# репликация / pg_dump --data-only).

set -euo pipefail

REMOTE="${REMOTE:?Set REMOTE=user@host}"
LOCAL_DSN="${LOCAL_DSN:-postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map}"
DUMP_LOCAL="/tmp/mushroom-dump-$(date +%Y%m%d-%H%M%S).bin"
DUMP_REMOTE="/tmp/$(basename "$DUMP_LOCAL")"

POSTGRES_USER="${POSTGRES_USER:-mushroom}"
POSTGRES_DB="${POSTGRES_DB:-mushroom_map}"

echo "[1/3] pg_dump локально -> $DUMP_LOCAL"
pg_dump --format=custom --no-owner --no-acl \
    --exclude-table-data='vk_post' \
    "$LOCAL_DSN" > "$DUMP_LOCAL"
echo "      размер: $(du -h "$DUMP_LOCAL" | cut -f1)"

echo "[2/3] scp -> $REMOTE:$DUMP_REMOTE"
scp -C "$DUMP_LOCAL" "$REMOTE:$DUMP_REMOTE"

echo "[3/3] pg_restore на удалённой стороне (через docker compose exec)"
ssh "$REMOTE" "
    set -e
    cd /srv/mushroom-map
    docker compose -f docker-compose.prod.yml --env-file .env.prod cp \"$DUMP_REMOTE\" db:/tmp/dump.bin
    docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db \
        pg_restore --clean --if-exists --no-owner --no-acl \
        -U $POSTGRES_USER -d $POSTGRES_DB /tmp/dump.bin
    docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db rm -f /tmp/dump.bin
    rm -f \"$DUMP_REMOTE\"
"

echo "Готово."
echo "Замечание: vk_post.text не переносится (--exclude-table-data='vk_post'),"
echo "          ингест VK заново через pipelines/ingest_vk.py на VM при необходимости."
