#!/usr/bin/env bash
# Emergency: flip DNS обратно на TimeWeb VM. Используется когда после
# cutover'а на Oracle что-то пошло не так, а TimeWeb VM ещё жива
# (Phase 7 soak-период).
#
# Пропагирование 5 мин (TTL опущен в Phase 4 через cloudflare_set_ttl.sh).
#
# Usage: bash scripts/deploy/rollback_to_timeweb.sh

set -euo pipefail

# Жёстко зашитый IP TimeWeb VM — в emergency не хочется ломать голову
# над параметризацией. Если TimeWeb VM сменила IP — обновить эту строку.
TIMEWEB_IP="${TIMEWEB_IP:-178.253.43.136}"

echo "[rollback] flipping DNS back to TimeWeb ($TIMEWEB_IP)"
NEW_IP="$TIMEWEB_IP" bash "$(dirname "$0")/cloudflare_dns_cutover.sh"

echo
echo "[rollback] done. Через ~5 мин:"
echo "  bash scripts/deploy/smoke_test_prod.sh geobiom.ru"
