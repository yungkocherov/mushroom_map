#!/usr/bin/env bash
# Запуск полного VK-пайплайна: collect → dates → photos → db
#
# Использование:
#   ./scripts/ingest_vk.sh                          # grib_spb → lenoblast (по умолчанию)
#   ./scripts/ingest_vk.sh grib_spb                 # своя группа, регион lenoblast
#   ./scripts/ingest_vk.sh grib_spb lenoblast       # своя группа + регион
#   ./scripts/ingest_vk.sh grib_spb lenoblast dates # только одна стадия (collect/dates/photos/db)
#
# Требует:
#   - Docker (контейнер mushroom_db на порту 5434)
#   - LM Studio с Gemma на 127.0.0.1:1234 (для стадии photos)
#   - VK_TOKEN в .env

set -euo pipefail

cd "$(dirname "$0")/.."

GROUP="${1:-grib_spb}"
REGION="${2:-lenoblast}"
STEP="${3:-}"

PYTHON="./.venv/Scripts/python.exe"
if [ ! -f "$PYTHON" ]; then
    PYTHON="./.venv/bin/python"
fi

export PYTHONIOENCODING=utf-8

echo "════════════════════════════════════════════════════════"
echo "  VK Pipeline: $GROUP → $REGION"
echo "════════════════════════════════════════════════════════"

# Проверяем что БД доступна
if ! docker ps --format '{{.Names}}' | grep -q '^mushroom_db$'; then
    echo "⚠ Контейнер mushroom_db не запущен. Поднимаю..."
    docker compose up -d db
    sleep 2
fi

# Запуск
if [ -n "$STEP" ]; then
    "$PYTHON" pipelines/ingest_vk.py --group "$GROUP" --region "$REGION" --step "$STEP"
else
    "$PYTHON" pipelines/ingest_vk.py --group "$GROUP" --region "$REGION"
fi
