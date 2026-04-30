#!/usr/bin/env bash
# Phase 4 of prod-readiness migration: flip A-records на новый IP через
# Cloudflare API. Если что-то пойдёт не так — rollback_to_timeweb.sh.
#
# Pre-conditions:
#   - cutover_to_oracle.sh уже прогнан, smoke-test через tailnet PASS.
#   - cloudflare_set_ttl.sh запускался 24h+ назад.
#   - .env.prod на Oracle с CADDY_API_HOST=api.geobiom.ru,
#     CADDY_WEB_HOST=geobiom.ru — Caddy получит TLS-cert от Let's Encrypt
#     сразу после flip'а (HTTP-01 challenge через :80).
#
# Usage:
#   NEW_IP=<oracle-public-ip> bash scripts/deploy/cloudflare_dns_cutover.sh
#
# После flip'а: подождать 5 мин, потом
#   bash scripts/deploy/smoke_test_prod.sh geobiom.ru   # → https://...

set -euo pipefail

CF_TOKEN_FILE="${CF_TOKEN_FILE:-$HOME/.cloudflare/geobiom-api-token}"
CF_ZONE_NAME="${CF_ZONE_NAME:-geobiom.ru}"
TTL="${TTL:-300}"
NEW_IP="${NEW_IP:?Set NEW_IP=<target ip>}"

[[ -r "$CF_TOKEN_FILE" ]] || { echo "missing $CF_TOKEN_FILE" >&2; exit 1; }
CF_TOKEN="$(cat "$CF_TOKEN_FILE")"

# Проверим что NEW_IP похож на IPv4 (sanity).
if ! [[ "$NEW_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "NEW_IP=$NEW_IP не выглядит как IPv4" >&2
    exit 1
fi

api() { curl -fsS -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" "$@"; }
extract() { grep -oE "\"$1\":\"[^\"]+\"" | head -1 | cut -d'"' -f4; }

zone_id=$(api "https://api.cloudflare.com/client/v4/zones?name=$CF_ZONE_NAME" | extract id)
[[ -n "$zone_id" ]] || { echo "zone not found" >&2; exit 1; }

echo "[cf] flipping A-records → $NEW_IP (zone=$CF_ZONE_NAME, ttl=$TTL)"
for name in "geobiom.ru" "www.geobiom.ru" "api.geobiom.ru"; do
    rec=$(api "https://api.cloudflare.com/client/v4/zones/$zone_id/dns_records?name=$name&type=A")
    rec_id=$(echo "$rec" | extract id)
    [[ -n "$rec_id" ]] || { echo "  SKIP  $name (нет A-записи)" >&2; continue; }

    api -X PATCH \
        "https://api.cloudflare.com/client/v4/zones/$zone_id/dns_records/$rec_id" \
        --data "{\"content\":\"$NEW_IP\",\"ttl\":$TTL,\"proxied\":false}" \
        >/dev/null
    echo "  $name → $NEW_IP"
done

cat <<NEXT

[cf] cutover applied. Через ~5 мин (TTL=$TTL):
    bash scripts/deploy/smoke_test_prod.sh geobiom.ru

Следить за TLS-cert (Caddy сделает acme HTTP-01):
    ssh geobiom-prod docker compose -f docker-compose.prod.yml logs caddy --tail 30

Rollback при проблемах:
    bash scripts/deploy/rollback_to_timeweb.sh
NEXT
