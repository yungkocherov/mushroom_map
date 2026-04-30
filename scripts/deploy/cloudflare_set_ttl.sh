#!/usr/bin/env bash
# Опустить DNS TTL до 300 s на geobiom.ru / www.geobiom.ru / api.geobiom.ru
# A-записях. Запускать за 24+ ч до DNS-cutover, чтобы старый TTL истёк
# и пропагирование во время cutover'а / rollback'а заняло 5 мин, не часы.
#
# Cloudflare API token: scope "Zone — DNS — Edit" на zone geobiom.ru.
# Хранится в ~/.cloudflare/geobiom-api-token (mode 600), один-разовая
# подготовка вручную: https://dash.cloudflare.com/profile/api-tokens.
#
# Usage:
#   bash scripts/deploy/cloudflare_set_ttl.sh

set -euo pipefail

CF_TOKEN_FILE="${CF_TOKEN_FILE:-$HOME/.cloudflare/geobiom-api-token}"
CF_ZONE_NAME="${CF_ZONE_NAME:-geobiom.ru}"
TTL="${TTL:-300}"

[[ -r "$CF_TOKEN_FILE" ]] || {
    echo "Cloudflare API token не найден: $CF_TOKEN_FILE" >&2
    echo "Создать: dash.cloudflare.com/profile/api-tokens" >&2
    echo "       chmod 600 $CF_TOKEN_FILE" >&2
    exit 1
}
CF_TOKEN="$(cat "$CF_TOKEN_FILE")"

api() {
    curl -fsS \
        -H "Authorization: Bearer $CF_TOKEN" \
        -H "Content-Type: application/json" \
        "$@"
}

# Минимальный JSON-парсинг через grep — чтобы не зависеть от jq.
extract() { grep -oE "\"$1\":\"[^\"]+\"" | head -1 | cut -d'"' -f4; }

zone_id=$(api "https://api.cloudflare.com/client/v4/zones?name=$CF_ZONE_NAME" \
          | extract id)
[[ -n "$zone_id" ]] || { echo "zone $CF_ZONE_NAME not found" >&2; exit 1; }
echo "[cf] zone_id=$zone_id"

for name in "geobiom.ru" "www.geobiom.ru" "api.geobiom.ru"; do
    rec=$(api "https://api.cloudflare.com/client/v4/zones/$zone_id/dns_records?name=$name&type=A")
    rec_id=$(echo "$rec" | extract id)
    rec_content=$(echo "$rec" | extract content)
    if [[ -z "$rec_id" || -z "$rec_content" ]]; then
        echo "  SKIP  $name (нет A-записи)" >&2
        continue
    fi
    api -X PATCH \
        "https://api.cloudflare.com/client/v4/zones/$zone_id/dns_records/$rec_id" \
        --data "{\"ttl\": $TTL, \"content\": \"$rec_content\", \"proxied\": false}" \
        >/dev/null
    echo "  $name → ttl=$TTL (content=$rec_content, proxied=false)"
done

echo
echo "[cf] TTL=$TTL applied. Wait 24h перед cutover для пропагирования."
