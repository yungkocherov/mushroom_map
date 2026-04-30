#!/usr/bin/env bash
# Smoke-тесты прод-стека. Использовать:
#   - До DNS-cutover (Phase 3) — против tailnet host: PROTO=http HOST=geobiom-prod
#   - После DNS-cutover (Phase 4) — против публичного host: PROTO=https HOST=geobiom.ru
#
# Usage:
#   bash scripts/deploy/smoke_test_prod.sh                  # → http://geobiom-prod
#   bash scripts/deploy/smoke_test_prod.sh geobiom.ru       # → http://geobiom.ru
#   PROTO=https bash scripts/deploy/smoke_test_prod.sh geobiom.ru   # → https://...
#
# Тестирует:
#   - GET /                   (фронт SPA)
#   - GET /health             (api alive)
#   - GET /api/healthz        (api + db reachable)
#   - GET /api/species?q=...  (search hits db)
#   - HEAD /tiles/forest.pmtiles  (PMTiles served via Caddy → API)

set -uo pipefail

HOST="${1:-geobiom-prod}"
PROTO="${PROTO:-http}"

# Если HOST содержит точку — публичный домен, дефолт https. Tailnet
# host'ы (geobiom-prod, ts.net) — http, потому что Caddy получает TLS
# только после DNS-cutover.
if [[ "$HOST" == *.* && "$PROTO" == "http" && -z "${FORCE_HTTP:-}" ]]; then
    PROTO=https
fi

# Для api endpoint'ов в идеале использовать api.<host>, если HOST = домен.
# В tailnet-режиме (Caddy на одной машине) api/ходят на тот же host.
if [[ "$HOST" == "geobiom.ru" ]]; then
    API_HOST="api.${HOST}"
else
    API_HOST="$HOST"
fi

fail=0
check() {
    local desc="$1" url="$2" expect_status="${3:-200}" method="${4:-GET}"
    local code
    code=$(curl -ksS -o /dev/null -w '%{http_code}' --max-time 15 \
                -X "$method" "$url" 2>/dev/null || echo 000)
    if [[ "$code" == "$expect_status" ]]; then
        printf "  OK    [%s] %-22s %s\n" "$code" "$desc" "$url"
    else
        printf "  FAIL  [%s != %s] %-18s %s\n" "$code" "$expect_status" "$desc" "$url" >&2
        fail=1
    fi
}

echo "[smoke] target: $PROTO://$HOST (api: $API_HOST)"

check "frontend SPA"   "$PROTO://$HOST/"                                    200
check "api health"     "$PROTO://$API_HOST/health"                          200
check "api healthz+db" "$PROTO://$API_HOST/api/healthz"                     200
check "species search" "$PROTO://$API_HOST/api/species?q=боровик"           200
check "tiles HEAD"     "$PROTO://$API_HOST/tiles/forest.pmtiles"            200 HEAD

if (( fail )); then
    echo "[smoke] FAIL"
    exit 1
fi
echo "[smoke] PASS"
