#!/usr/bin/env bash
# Regenerate services/api/requirements.lock from pyproject.toml.
#
# Запускать после любого изменения services/api/pyproject.toml dependencies.
# Использует Docker python:3.11-slim — точно тот же base что в
# Dockerfile.prod. Это значит lockfile валиден для всех платформ
# (linux/amd64 + linux/arm64) которые prod-image билдит через buildx.
#
# pip-tools, build-essential, libpq-dev — нужны для resolving (psycopg
# и rasterio пытаются собраться из source если wheel'а не находят).
#
# Использование:
#   bash scripts/dev/regen_api_lockfile.sh
#
# После запуска проверь diff:
#   git diff services/api/requirements.lock
#
# Не запускать в CI! Это разработческая операция, lockfile должен быть
# committed result, не build artifact.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_DIR="$REPO_ROOT/services/api"

if [[ ! -f "$API_DIR/pyproject.toml" ]]; then
    echo "ERROR: $API_DIR/pyproject.toml не найден" >&2
    exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker не установлен" >&2
    exit 1
fi

echo "[regen-lock] running pip-compile in python:3.11-slim ..."

# MSYS_NO_PATHCONV нужен на Windows MSYS2/Git-bash чтобы /app не
# превратился в C:/Program Files/Git/app.
MSYS_NO_PATHCONV=1 docker run --rm \
    -v "$API_DIR:/app" \
    -w /app \
    python:3.11-slim bash -c '
        set -e
        apt-get update -qq
        apt-get install -qq -y --no-install-recommends build-essential libpq-dev > /dev/null
        pip install --quiet --upgrade pip pip-tools
        pip-compile --quiet --strip-extras --output-file=requirements.lock pyproject.toml
    '

if [[ ! -s "$API_DIR/requirements.lock" ]]; then
    echo "ERROR: requirements.lock пустой" >&2
    exit 1
fi

n_pkgs=$(grep -cE '^[a-zA-Z]' "$API_DIR/requirements.lock" || echo 0)
echo "[regen-lock] done: $n_pkgs packages locked → services/api/requirements.lock"
echo "[regen-lock] check: git diff services/api/requirements.lock"
