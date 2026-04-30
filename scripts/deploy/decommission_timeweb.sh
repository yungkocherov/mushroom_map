#!/usr/bin/env bash
# Phase 8 of prod-readiness migration: после успешного soak-периода
# (1-2 недели на Oracle без инцидентов) — снять конфиги с TimeWeb в
# Y.O.S. и подготовить инструкции для отключения TimeWeb.
#
# Что НЕ делает: не удаляет TimeWeb VM сам (это manual step через
# TimeWeb dashboard, там billing-нюансы). Только архивирует то, что
# может понадобиться для recovery.
#
# Usage:
#   AGE_RECIPIENT=age1xxxx... \
#   TIMEWEB_HOST=geobiom-prod-timeweb \
#     bash scripts/deploy/decommission_timeweb.sh

set -euo pipefail

TIMEWEB_HOST="${TIMEWEB_HOST:-geobiom-prod-timeweb}"
RCLONE_REMOTE="${RCLONE_REMOTE:-geobiom-yos}"
YOS_BUCKET="${YOS_BUCKET:-geobiom-backups}"
AGE_RECIPIENT="${AGE_RECIPIENT:?Set AGE_RECIPIENT=<age1...> (public key)}"
DATE_UTC=$(date -u +%F)

for cmd in age rclone ssh scp; do
    command -v "$cmd" >/dev/null || { echo "missing: $cmd" >&2; exit 1; }
done

echo "[1/4] sanity: TimeWeb доступен?"
ssh -o ConnectTimeout=5 "$TIMEWEB_HOST" true \
    || { echo "$TIMEWEB_HOST unreachable" >&2; exit 1; }

echo "[2/4] tar /srv на TimeWeb"
ssh "$TIMEWEB_HOST" '
    set -e
    cd /
    tar -czf /tmp/timeweb-srv.tar.gz \
        srv/mushroom-map/.env.prod \
        srv/mushroom-map/infra \
        srv/web \
        2>/dev/null || true
    ls -lh /tmp/timeweb-srv.tar.gz
'

echo "[3/4] pull → encrypt → upload в Y.O.S."
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
scp "$TIMEWEB_HOST:/tmp/timeweb-srv.tar.gz" "$WORK/timeweb-srv.tar.gz"
age -r "$AGE_RECIPIENT" -o "$WORK/timeweb-srv.tar.age" "$WORK/timeweb-srv.tar.gz"
rclone copyto "$WORK/timeweb-srv.tar.age" \
    "${RCLONE_REMOTE}:${YOS_BUCKET}/configs/timeweb-decommission-${DATE_UTC}.tar.age"
ssh "$TIMEWEB_HOST" 'rm -f /tmp/timeweb-srv.tar.gz'

echo "[4/4] DONE."
cat <<NEXT

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Configs архивированы:
  ${RCLONE_REMOTE}:${YOS_BUCKET}/configs/timeweb-decommission-${DATE_UTC}.tar.age

Manual finish:
  1. https://timeweb.cloud/my/servers — выключить + удалить VM.
     Проверить billing: VM не должна остаться в режиме «приостановлен»
     (там может продолжаться списание за volume).
  2. В CLAUDE.md обновить «Production стек» секцию:
     - дата live с YYYY-MM-DD (= cutover date)
     - заменить «TimeWeb VM 178.253.43.136» на «Oracle Cloud Free Tier
       ARM 4 OCPU / 24 GB»
     - убрать упоминание TimeWeb fallback'а
  3. ~/.ssh/config:
     - удалить alias geobiom-prod-timeweb
     - geobiom-prod alias оставить (это теперь Oracle)
  4. memory: обновить project_website_migration.md → DONE
  5. README.md / docs/architecture.md — если упоминают TimeWeb,
     заменить на Oracle.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEXT
