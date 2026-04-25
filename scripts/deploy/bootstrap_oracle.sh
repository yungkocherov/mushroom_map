#!/usr/bin/env bash
# bootstrap_oracle.sh — однократная подготовка Oracle Cloud Free Tier
# ARM Ampere VM (Ubuntu 22.04). Выполняется ВРУЧНУЮ при первом
# подключении к свежей VM.
#
# Что делает:
#   1. Обновляет apt
#   2. Ставит docker + docker compose v2
#   3. Открывает 80/443 в iptables (Oracle ARM по умолчанию закрыт)
#   4. Создаёт /srv/mushroom-map с правами текущего юзера
#   5. Клонирует репозиторий
#
# Использование (с локальной машины через ssh):
#   ssh ubuntu@<vm-ip> 'bash -s' < scripts/deploy/bootstrap_oracle.sh
#
# После завершения — заполнить /srv/mushroom-map/.env.prod (см.
# infra/.env.prod.example) и запустить `docker compose -f
# docker-compose.prod.yml --env-file .env.prod up -d`.

set -euo pipefail

REPO_URL="https://github.com/yungkocherov/mushroom_map.git"
TARGET="/srv/mushroom-map"

echo "[1/5] apt update + базовые пакеты"
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg git ufw

echo "[2/5] Docker engine + compose plugin (официальный apt-repo)"
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

# Без перелогина docker без sudo не заработает — просим юзера выйти/войти.
sudo usermod -aG docker "$USER" || true

echo "[3/5] iptables — открываем 80/443 (Oracle ARM закрыт по умолчанию)"
sudo iptables -I INPUT -p tcp --dport 80  -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save 2>/dev/null || \
    sudo sh -c "iptables-save > /etc/iptables/rules.v4" || true

# UFW (если используется) — на всякий случай.
if command -v ufw >/dev/null 2>&1; then
    sudo ufw allow 22/tcp || true
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
fi

echo "[4/5] $TARGET с правами $USER"
sudo mkdir -p "$TARGET"
sudo chown -R "$USER:$USER" "$TARGET"

echo "[5/5] git clone"
if [ ! -d "$TARGET/.git" ]; then
    git clone --depth=1 "$REPO_URL" "$TARGET"
fi

cat <<'NEXT'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Готово. Дальнейшие шаги (вручную):

  1. Выйти и зайти заново по ssh (чтобы docker-группа применилась).
  2. cd /srv/mushroom-map
  3. cp infra/.env.prod.example .env.prod  (и заполнить секреты)
  4. mkdir -p data/tiles data/copernicus/terrain
     # затем — pg_restore + загрузить tiles (см. scripts/deploy/sync_to_remote.sh)
  5. docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
  6. docker compose -f docker-compose.prod.yml exec api \
        python /app/src/api/migrate_runner.py  (или применить миграции
        иначе — см. db/migrate.py в репо)

Перед первым up: настроить DNS — A-запись api.<домен> → IP этой VM,
иначе Caddy не сможет получить TLS-сертификат.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEXT
