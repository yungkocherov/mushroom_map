#!/usr/bin/env bash
# bootstrap_oracle.sh — однократная подготовка прод-VM (Oracle Cloud Free
# Tier ARM Ampere VM 4 OCPU / 24 GB или эквивалент). Запускается ВРУЧНУЮ
# при первом подключении к свежей VM.
#
# Что делает:
#   1. Обновляет apt + ставит base пакеты
#   2. 4 GB swapfile (Oracle ARM ships без swap'а; OOM ловит Postgres)
#   3. Docker engine + compose v2 (официальный apt-repo)
#   4. Tailscale (operator завершает OAuth-flow вручную)
#   5. ufw lockdown: deny 22 except tailnet, allow 80/443
#   6. age + rclone — для backup pipeline (см. scripts/backup/)
#   7. /etc/geobiom (700 root:root) — для .env.backup
#   8. /srv/mushroom-map с правами текущего юзера + git clone
#
# Использование (с локальной машины через ssh):
#   ssh ubuntu@<vm-ip> 'bash -s' < scripts/deploy/bootstrap_oracle.sh
#
# После завершения — выйти/зайти заново (docker-группа), завершить
# Tailscale OAuth, скопировать .env.prod, restore БД из Y.O.S. бэкапа
# (scripts/deploy/cutover_to_oracle.sh).

set -euo pipefail

REPO_URL="https://github.com/yungkocherov/mushroom_map.git"
TARGET="/srv/mushroom-map"

echo "[1/8] apt update + базовые пакеты"
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg git ufw

echo "[2/8] 4 GB swapfile (Oracle ARM Free Tier ships без swap'а)"
if ! swapon --show 2>/dev/null | grep -q "/swapfile"; then
    sudo fallocate -l 4G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    if ! grep -q "^/swapfile" /etc/fstab; then
        echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
    fi
    sudo sysctl -w vm.swappiness=10 >/dev/null
    if ! grep -q "^vm.swappiness" /etc/sysctl.conf; then
        echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf >/dev/null
    fi
    echo "  swap mounted, swappiness=10"
else
    echo "  swap already configured"
fi

echo "[3/8] Docker engine + compose plugin"
if ! command -v docker >/dev/null 2>&1; then
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg

    echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
        $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt-get update
    sudo apt-get install -y \
        docker-ce docker-ce-cli containerd.io \
        docker-buildx-plugin docker-compose-plugin
fi
sudo usermod -aG docker "$USER" || true

echo "[4/8] Tailscale install"
if ! command -v tailscale >/dev/null 2>&1; then
    curl -fsSL https://tailscale.com/install.sh | sudo sh
fi

echo "[5/8] ufw — safe rules (без 22-lockdown'а пока Tailscale не up)"
sudo ufw --force reset >/dev/null
sudo ufw default deny incoming
sudo ufw default allow outgoing
# 22/tcp пока allowed from anywhere — иначе SSH-сессия, через которую
# запущен bootstrap, оборвётся. После Tailscale OAuth запустить
# scripts/deploy/lockdown_oracle.sh для финального deny 22 except tailnet.
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
echo "  ufw active с временным public 22. Lockdown позже — см. NEXT-блок."

echo "[6/8] backup tooling (age + rclone)"
sudo apt-get install -y age rclone
sudo mkdir -p /etc/geobiom
sudo chown root:root /etc/geobiom
sudo chmod 700 /etc/geobiom

echo "[7/8] $TARGET с правами $USER"
sudo mkdir -p "$TARGET"
sudo chown -R "$USER:$USER" "$TARGET"

echo "[8/8] git clone"
if [ ! -d "$TARGET/.git" ]; then
    git clone --depth=1 "$REPO_URL" "$TARGET"
fi

cat <<'NEXT'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Готово. Дальнейшие шаги (вручную):

  1. Выйти и зайти заново по ssh (чтобы docker-группа применилась).
  2. Tailscale OAuth:
       sudo tailscale up --ssh --hostname=geobiom-prod
     После этого в https://login.tailscale.com/admin/machines:
       - tag машины как `tag:prod`
       - проверить что MagicDNS работает: ssh geobiom-prod.tail-XXXX.ts.net
  2.5. ПОСЛЕ Tailscale up: запустить ufw lockdown с dev-машины:
       ssh geobiom-prod-oracle bash /srv/mushroom-map/scripts/deploy/lockdown_oracle.sh
       Это закроет 22/tcp от public, оставив только из tailnet (100.64.0.0/10).
  3. /etc/geobiom/.env.backup (см. scripts/backup/README.md §3):
       sudo nano /etc/geobiom/.env.backup
       sudo chmod 600 /etc/geobiom/.env.backup
  4. /root/.config/rclone/rclone.conf (см. scripts/backup/README.md §4)
  5. /srv/mushroom-map/.env.prod (скопировать с TimeWeb или infra/.env.prod.example)
  6. mkdir -p /srv/mushroom-map/data/tiles /srv/mushroom-map/data/copernicus/terrain
  7. С dev-машины: bash scripts/deploy/install_backup_systemd.sh
     (раскатает scripts/backup/*.sh + systemd unit'ы)
  8. С dev-машины: bash scripts/deploy/cutover_to_oracle.sh
     (restore БД из Y.O.S. бэкапа + sync tiles + up стека)

Перед DNS cutover (Phase 4):
  - Опустить TTL до 300 за 24h: bash scripts/deploy/cloudflare_set_ttl.sh
  - Затем: NEW_IP=<oracle-ip> bash scripts/deploy/cloudflare_dns_cutover.sh
  - Smoke-test: bash scripts/deploy/smoke_test_prod.sh geobiom.ru
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEXT
