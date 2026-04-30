#!/usr/bin/env bash
# Push backup scripts to a prod VM and install/enable systemd timers.
# Run from dev machine after the operator manual prerequisites in
# scripts/backup/README.md §1-§4 are done.
#
# Usage:
#   REMOTE=root@<vm-ip> bash scripts/deploy/install_backup_systemd.sh
#   # or with the geobiom-prod ssh alias:
#   REMOTE=geobiom-prod bash scripts/deploy/install_backup_systemd.sh

set -euo pipefail

REMOTE="${REMOTE:?Set REMOTE=user@host or geobiom-prod}"
TARGET_DIR="/srv/geobiom/scripts/backup"

echo "[deploy] preparing $REMOTE:$TARGET_DIR"
ssh "$REMOTE" "mkdir -p $TARGET_DIR /etc/geobiom"

echo "[deploy] rsync scripts/backup/ -> $REMOTE:$TARGET_DIR"
rsync -av --delete \
    --exclude '.env.local' \
    --exclude 'rclone.conf' \
    scripts/backup/ "$REMOTE:$TARGET_DIR/"

echo "[deploy] installing systemd units + enabling timers"
ssh "$REMOTE" bash <<'REMOTE_EOF'
set -euo pipefail

chmod +x /srv/geobiom/scripts/backup/*.sh

# Install systemd units (overwrite if changed).
cp /srv/geobiom/scripts/backup/systemd/*.service /etc/systemd/system/
cp /srv/geobiom/scripts/backup/systemd/*.timer   /etc/systemd/system/

systemctl daemon-reload

# Sanity-check that .env.backup exists. If not, the operator hasn't
# done the README §3 step yet — refuse to enable timers, since the
# first run would fail.
if [[ ! -r /etc/geobiom/.env.backup ]]; then
    echo "[deploy] /etc/geobiom/.env.backup not found — see scripts/backup/README.md §3" >&2
    echo "[deploy] systemd units installed but timers NOT enabled" >&2
    exit 2
fi

# Sanity-check that rclone is configured. dump_db.sh would otherwise
# fail with an opaque "remote not found" inside the timer.
if ! rclone listremotes 2>/dev/null | grep -q '^geobiom-yos:$'; then
    echo "[deploy] rclone remote 'geobiom-yos' not configured — see scripts/backup/README.md §4" >&2
    echo "[deploy] systemd units installed but timers NOT enabled" >&2
    exit 2
fi

systemctl enable --now geobiom-backup.timer
systemctl enable --now geobiom-backup-rotate.timer

echo "[deploy] enabled timers:"
systemctl list-timers --no-pager | grep -E '(geobiom|NEXT)' || true
REMOTE_EOF

echo "[deploy] done. To trigger first backup manually:"
echo "  ssh $REMOTE systemctl start geobiom-backup.service"
echo "  ssh $REMOTE journalctl -u geobiom-backup.service -n 30 --no-pager"
