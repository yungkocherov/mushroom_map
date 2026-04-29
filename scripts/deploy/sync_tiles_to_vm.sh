#!/usr/bin/env bash
# sync_tiles_to_vm.sh — заливка PMTiles на TimeWeb VM (api.geobiom.ru).
#
# Заменяет старый sync_tiles_to_r2.sh (R2 заблочен TSPU из РФ без VPN —
# см. infra/Caddyfile комментарий 2026-04-29). Тайлы теперь раздаёт Caddy
# на VM по /tiles/* → API:8000 → /tiles bind-mount = /srv/mushroom-map/tiles/.
#
# Использование:
#   bash scripts/deploy/sync_tiles_to_vm.sh           # все *.pmtiles + *.geojson
#   bash scripts/deploy/sync_tiles_to_vm.sh forest    # только forest.pmtiles
#
# Env:
#   SSH_HOST   (default: geobiom-prod — alias из ~/.ssh/config)
#   REMOTE_DIR (default: /srv/mushroom-map/tiles)
#   TILES_DIR  (default: data/tiles)
#
# Под Windows Git Bash rsync обычно отсутствует — используем scp. На Linux/macOS
# rsync эффективнее (incremental + progress), скрипт ловит сам.

set -euo pipefail

SSH_HOST="${SSH_HOST:-geobiom-prod}"
REMOTE_DIR="${REMOTE_DIR:-/srv/mushroom-map/tiles}"
TILES_DIR="${TILES_DIR:-data/tiles}"

if [ ! -d "$TILES_DIR" ]; then
    echo "TILES_DIR=$TILES_DIR не существует" >&2
    exit 1
fi

# Собираем список файлов: либо передан как аргументы (e.g. forest hillshade),
# либо все pmtiles + geojson.
files=()
if [ $# -gt 0 ]; then
    for layer in "$@"; do
        f="$TILES_DIR/${layer}.pmtiles"
        if [ ! -f "$f" ]; then
            echo "файл $f не найден" >&2
            exit 1
        fi
        files+=("$f")
    done
else
    for f in "$TILES_DIR"/*.pmtiles "$TILES_DIR"/*.geojson; do
        [ -f "$f" ] && files+=("$f")
    done
fi

if [ ${#files[@]} -eq 0 ]; then
    echo "нет файлов для заливки" >&2
    exit 1
fi

echo "Заливаем ${#files[@]} файл(ов) → $SSH_HOST:$REMOTE_DIR"
for f in "${files[@]}"; do
    sz=$(du -h "$f" | cut -f1)
    echo "  $f ($sz)"
done

# rsync если доступен — incremental, прогресс, atomic temp-file. Иначе scp.
if command -v rsync >/dev/null 2>&1; then
    rsync -avh --progress "${files[@]}" "$SSH_HOST:$REMOTE_DIR/"
else
    scp -p "${files[@]}" "$SSH_HOST:$REMOTE_DIR/"
fi

echo ""
echo "done. Проверить:"
echo "  curl -I https://api.geobiom.ru/tiles/forest.pmtiles"
