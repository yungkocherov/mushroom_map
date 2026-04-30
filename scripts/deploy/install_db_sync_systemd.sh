#!/usr/bin/env bash
# Деплой sync_db_timeweb_to_oracle.sh на TimeWeb VM как systemd-юнит.
# Запускается с dev-машины: REMOTE=geobiom-prod-timeweb bash $0
#
# Pre-requisite: SSH-key /root/.ssh/sync_to_oracle уже сгенерирован на
# TimeWeb и public-часть добавлена в Oracle authorized_keys (см. README
# scripts/deploy/sync_db_timeweb_to_oracle.sh).

set -euo pipefail

REMOTE=${REMOTE:?Set REMOTE=geobiom-prod-timeweb}
HERE=$(cd "$(dirname "$0")" && pwd)

echo "[install] copying script and units to $REMOTE"
scp "$HERE/sync_db_timeweb_to_oracle.sh" "$REMOTE:/usr/local/bin/geobiom-db-sync.sh"
scp "$HERE/systemd/geobiom-db-sync.service" "$REMOTE:/etc/systemd/system/"
scp "$HERE/systemd/geobiom-db-sync.timer"   "$REMOTE:/etc/systemd/system/"

ssh "$REMOTE" 'set -e
    chmod +x /usr/local/bin/geobiom-db-sync.sh
    systemctl daemon-reload
    systemctl enable --now geobiom-db-sync.timer
    systemctl list-timers --no-pager | grep db-sync || true
'

echo
echo "[install] done. Запустить вручную для теста:"
echo "    ssh $REMOTE systemctl start geobiom-db-sync.service"
echo "    ssh $REMOTE journalctl -u geobiom-db-sync -f"
