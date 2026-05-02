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
    # `-X HEAD` ломает curl в неожиданных местах (тело тянется как при GET,
    # %{http_code} собирается криво); канонический способ HEAD — `-I`.
    if [[ "$method" == "HEAD" ]]; then
        code=$(curl -ksSI -o /dev/null -w '%{http_code}' --max-time 15 \
                    "$url" 2>/dev/null || echo 000)
    else
        code=$(curl -ksS -o /dev/null -w '%{http_code}' --max-time 15 \
                    -X "$method" "$url" 2>/dev/null || echo 000)
    fi
    if [[ "$code" == "$expect_status" ]]; then
        printf "  OK    [%s] %-22s %s\n" "$code" "$desc" "$url"
    else
        printf "  FAIL  [%s != %s] %-18s %s\n" "$code" "$expect_status" "$desc" "$url" >&2
        fail=1
    fi
}

echo "[smoke] target: $PROTO://$HOST (api: $API_HOST)"

# species search: q-параметр URL-encoded — bash literal с UTF-8 байтами
# улетит как mojibake через caddy/uvicorn и даст 400. `boletus` (slug
# внутри name_lat) триггерит ту же кодопаду в БД и проверяет тот же
# контракт.
check "frontend SPA"   "$PROTO://$HOST/"                                    200
check "api health"     "$PROTO://$API_HOST/health"                          200
check "api healthz+db" "$PROTO://$API_HOST/api/healthz"                     200
check "species search" "$PROTO://$API_HOST/api/species/?q=boletus"          200
check "tiles HEAD"     "$PROTO://$API_HOST/tiles/forest.pmtiles"            200 HEAD

# Negative checks: GlitchTip и Umami compose-overlay'и заявляют что
# биндятся только на 127.0.0.1 ([Caddyfile:144-146] комментарий).
# Если кто-то перенастроил overlay на 0.0.0.0 — публично доступный
# админ-интерфейс. Лучше ловить это smoke'ом, чем по факту утечки.
# Проверяем оба порта; ожидаем connection refused / timeout (не 200).
check_loopback_only() {
    local desc="$1" url="$2"
    local code
    code=$(curl -ksS -o /dev/null -w '%{http_code}' --max-time 3 \
                "$url" 2>/dev/null || echo 000)
    # 000 = network error (refused / timed out / no host) — то что мы хотим.
    if [[ "$code" == "000" ]]; then
        printf "  OK    [%s] %-22s %s\n" "$code" "$desc" "$url"
    else
        printf "  FAIL  [%s ≠ 000] %-18s %s — порт публично доступен\n" \
            "$code" "$desc" "$url" >&2
        fail=1
    fi
}

# Эти проверки делаем только против публичного host'а — на tailnet
# 127.0.0.1 = сам узел, проверка бессмысленна.
# Также скипаем если observability-стек ещё не задеплоен — connection
# refused на 8001/3000 возвращает 000 ровно как «всё хорошо», но это
# false positive (скан не должен сообщать «безопасно» если сервиса
# просто нет). Активируется через SMOKE_OBS=1.
if [[ "$HOST" == *.* && "${SMOKE_OBS:-0}" == "1" ]]; then
    check_loopback_only "glitchtip leak"  "http://$HOST:8001/"
    check_loopback_only "umami leak"      "http://$HOST:3000/"
fi

if (( fail )); then
    echo "[smoke] FAIL"
    exit 1
fi
echo "[smoke] PASS"
