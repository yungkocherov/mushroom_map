#!/usr/bin/env bash
# Запуск только стадии распознавания видов грибов по фото через Gemma (LM Studio).
# Предполагает что посты уже скачаны и даты извлечены.
#
# Использование:
#   ./scripts/classify_photos.sh                    # grib_spb
#   ./scripts/classify_photos.sh grib_spb
#
# Требует:
#   - LM Studio запущена с моделью google/gemma-3-12b на 127.0.0.1:1234
#   - data/vk/{group}/raw_posts.json существует (иначе запусти ingest_vk.sh сначала)

set -euo pipefail

cd "$(dirname "$0")/.."

GROUP="${1:-grib_spb}"

PYTHON="./.venv/Scripts/python.exe"
if [ ! -f "$PYTHON" ]; then
    PYTHON="./.venv/bin/python"
fi

export PYTHONIOENCODING=utf-8

# Проверка что LM Studio доступна
LM_STUDIO_URL="${LM_STUDIO_URL:-http://127.0.0.1:1234/v1/chat/completions}"
LM_STUDIO_BASE="${LM_STUDIO_URL%/chat/completions}"

echo "════════════════════════════════════════════════════════"
echo "  Photo Classification: $GROUP"
echo "  LM Studio: $LM_STUDIO_URL"
echo "════════════════════════════════════════════════════════"

if ! curl -fsS --max-time 5 "$LM_STUDIO_BASE/models" > /dev/null 2>&1; then
    echo "❌ LM Studio недоступна по адресу $LM_STUDIO_BASE/models"
    echo "   1. Открой LM Studio"
    echo "   2. Загрузи модель google/gemma-3-12b"
    echo "   3. Запусти сервер (Developer → Start Server)"
    exit 1
fi
echo "✓ LM Studio доступна"
echo ""

# Проверка что есть raw_posts.json
RAW_POSTS="data/vk/$GROUP/raw_posts.json"
if [ ! -f "$RAW_POSTS" ]; then
    echo "❌ Нет файла $RAW_POSTS"
    echo "   Сначала запусти: ./scripts/ingest_vk.sh $GROUP <region> collect"
    exit 1
fi
echo "✓ Посты: $RAW_POSTS"
echo ""

# Запускаем только стадию photos
"$PYTHON" pipelines/ingest_vk.py --group "$GROUP" --step photos
