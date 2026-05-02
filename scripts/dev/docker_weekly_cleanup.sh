#!/usr/bin/env bash
#
# Еженедельная чистка Docker. Запускать раз в неделю на dev-машине.
#
# Что делает:
#   1. Дропает image-слои старше 7 дней, не привязанные к живому контейнеру.
#   2. Дропает build cache старше 7 дней.
#   3. Дропает orphan volume'ы (без LINKS).
#
# Что НЕ делает (намеренно):
#   - Не трогает named volume'ы — `mushroom-map_pgdata` (5.78 GB БД) живёт.
#   - Не трогает контейнеры (даже Exited) — для этого `docker rm` явно.
#   - Не сжимает VHDX. Это делается из админского PowerShell:
#       Optimize-VHD -Path "$env:LOCALAPPDATA\Docker\wsl\disk\docker_data.vhdx" -Mode Full
#     Без compact'а место внутри VHDX освобождается, но файл на C: не уменьшается
#     до перезапуска WSL и ручного compact'а (или sparse-VHDX в Docker Desktop GUI).
#
# Использование:
#   bash scripts/dev/docker_weekly_cleanup.sh
#
# История: создан 2026-05-02 после cleanup'а 130 GB → ~10 GB. См.
# `docs/superpowers/specs/2026-05-02-docker-disk-cleanup.md`.

set -euo pipefail

echo "=== Docker disk usage BEFORE ==="
docker system df

echo
echo "=== Pruning images older than 7 days, not in use ==="
docker image prune --filter "until=168h" -f

echo
echo "=== Pruning build cache older than 7 days ==="
docker builder prune --filter "until=168h" -f

echo
echo "=== Pruning orphan volumes (no links) ==="
docker volume prune -f

echo
echo "=== Docker disk usage AFTER ==="
docker system df

echo
echo "Done. To actually shrink the VHDX file on C: drive, run from"
echo "an ADMIN PowerShell after closing Docker Desktop and 'wsl --shutdown':"
echo
echo '  Optimize-VHD -Path "$env:LOCALAPPDATA\Docker\wsl\disk\docker_data.vhdx" -Mode Full'
