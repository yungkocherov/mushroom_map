#!/usr/bin/env bash
# Финальный ufw lockdown на Oracle VM. Запускается ПОСЛЕ того как
# Tailscale up прошёл OAuth (см. bootstrap_oracle.sh NEXT-блок шаг 2).
#
# Что делает:
#   - Проверяет что Tailscale активен (иначе выходит без изменений —
#     иначе закрытие 22 убьёт нас же).
#   - deny 22/tcp from any
#   - allow 22/tcp from 100.64.0.0/10 (Tailscale CGNAT)
#   - allow 80/443 остаётся (для Caddy)
#
# Usage (с самой VM):
#   sudo bash /srv/mushroom-map/scripts/deploy/lockdown_oracle.sh
#
# Usage (с dev-машины через ssh):
#   ssh geobiom-prod-oracle 'sudo bash /srv/mushroom-map/scripts/deploy/lockdown_oracle.sh'

set -euo pipefail

# Sanity: tailscale up должен быть активен. Без этого закрытие 22 =
# kill SSH-сессии без возможности вернуться (без console-доступа).
if ! command -v tailscale >/dev/null 2>&1; then
    echo "[lockdown] tailscale не установлен — abort" >&2
    exit 1
fi
if ! tailscale status --peers=false >/dev/null 2>&1; then
    echo "[lockdown] tailscale not up — abort" >&2
    echo "[lockdown] сначала: sudo tailscale up --ssh --hostname=geobiom-prod" >&2
    exit 1
fi

TAILNET_IP=$(tailscale ip -4 2>/dev/null | head -1 || echo "")
echo "[lockdown] tailscale active, tailnet IP: ${TAILNET_IP:-unknown}"

# Replace public 22 rule with tailnet-only.
echo "[lockdown] tightening ufw"
sudo ufw delete allow 22/tcp 2>/dev/null || true
sudo ufw allow from 100.64.0.0/10 to any port 22 comment 'Tailscale CGNAT'
sudo ufw reload >/dev/null

echo
echo "[lockdown] current rules:"
sudo ufw status numbered | head -20

cat <<'NEXT'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ufw locked down. SSH теперь только через tailnet.

Проверка с dev-машины:
  ssh geobiom-prod-oracle.tail-XXXX.ts.net true
    # должно работать через MagicDNS

  ssh -o ConnectTimeout=5 ubuntu@<public-ip> true
    # должно отваливаться по timeout (порт 22 закрыт от public)

Дополнительный (рекомендованный) шаг — Oracle Cloud Console → VCN →
Security List: убрать ingress rule для port 22 from 0.0.0.0/0. Это
двухуровневая защита: ufw на хосте + cloud firewall в VCN.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEXT
