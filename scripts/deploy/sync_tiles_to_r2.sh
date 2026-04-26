#!/usr/bin/env bash
# sync_tiles_to_r2.sh — заливка PMTiles в Cloudflare R2 для CDN-раздачи.
#
# Использует rclone: https://rclone.org/install/
#
# Подготовка (однократно):
#   rclone config
#     -> n (new remote)
#     -> name: r2
#     -> Storage: 'Amazon S3'
#     -> provider: 'Cloudflare'
#     -> ACCESS_KEY / SECRET_KEY от R2 (создать в Cloudflare → R2 → Manage API Tokens)
#     -> endpoint: https://<account_id>.r2.cloudflarestorage.com
#     -> region: auto
#
# Использование:
#   bash scripts/deploy/sync_tiles_to_r2.sh
#
# Env:
#   BUCKET (default: mushroom-map-tiles)
#   TILES_DIR (default: data/tiles)

set -euo pipefail

BUCKET="${BUCKET:-geobiom-tiles}"
TILES_DIR="${TILES_DIR:-data/tiles}"

if ! command -v rclone >/dev/null 2>&1; then
    echo "rclone не установлен. https://rclone.org/install/" >&2
    exit 1
fi

if [ ! -d "$TILES_DIR" ]; then
    echo "TILES_DIR=$TILES_DIR не существует" >&2
    exit 1
fi

echo "Заливаем $TILES_DIR -> r2:$BUCKET"
rclone sync "$TILES_DIR" "r2:$BUCKET" \
    --include "*.pmtiles" \
    --progress \
    --transfers 4 \
    --s3-no-check-bucket

cat <<'NEXT'

Готово. Дальше нужно сконфигурировать раздачу:

  1. В Cloudflare R2 → bucket → Settings → Public Access:
     включить публичный URL ИЛИ привязать кастомный домен tiles.<твой-домен>.
  2. На фронте VITE_API_URL остаётся указывать на api-домен; PMTiles в коде
     можно переключить на прямую R2-ссылку через VITE_TILES_URL (если
     добавишь обработку в src/components/MapView.tsx).
  3. Range-requests R2 поддерживает out-of-the-box.

Если bucket уже публичный, проверка curl:
  curl -I https://pub-<id>.r2.dev/forest.pmtiles
NEXT
