#!/usr/bin/env bash
# oracle_capacity_catcher.sh — ловим Out-of-capacity в Oracle Free Tier ARM.
#
# Запускает попытки `oci compute instance launch` с интервалом, пока не
# получит инстанс. На "Out of capacity" / "InternalError" ждём и пробуем
# снова. Любая другая ошибка — стоп, чтобы не плодить мусор.
#
# Использование:
#   bash scripts/deploy/oracle_capacity_catcher.sh
#
# Можно переопределить интервал и shape через env:
#   INTERVAL_SEC=90 OCPUS=2 RAM_GB=12 bash scripts/deploy/oracle_capacity_catcher.sh

set -uo pipefail

# ─── Параметры окружения (из oci iam / oci network) ──────────────────
COMPARTMENT_ID="ocid1.tenancy.oc1..aaaaaaaazxeefm6f5qlxguz2gv2gmlpeztmdtfmxv2wrg7qqwzwhkpz42x4a"
AD="ShvU:EU-STOCKHOLM-1-AD-1"
SUBNET_ID="ocid1.subnet.oc1.eu-stockholm-1.aaaaaaaat4otl6waxj7wcjymqnofjrhovivfirjkabuvep5bvqztculfhwfa"
IMAGE_ID="ocid1.image.oc1.eu-stockholm-1.aaaaaaaafjqgsnrj5ggl7tkdcpcl6jkeeseh7hibvz6snehqg2sopqnctx7q"

# ─── Настройки VM ────────────────────────────────────────────────────
DISPLAY_NAME="${DISPLAY_NAME:-geobiom-prod}"
SHAPE="${SHAPE:-VM.Standard.A1.Flex}"
OCPUS="${OCPUS:-4}"
RAM_GB="${RAM_GB:-24}"
BOOT_VOLUME_GB="${BOOT_VOLUME_GB:-200}"
SSH_PUBKEY_FILE="${SSH_PUBKEY_FILE:-$HOME/.ssh/geobiom_yc.pub}"

# ─── Поведение скрипта ───────────────────────────────────────────────
INTERVAL_SEC="${INTERVAL_SEC:-120}"
LOG_FILE="${LOG_FILE:-$HOME/oracle_catcher.log}"

if [ ! -f "$SSH_PUBKEY_FILE" ]; then
    echo "SSH pubkey не найден: $SSH_PUBKEY_FILE" >&2
    exit 1
fi

SSH_PUBKEY=$(cat "$SSH_PUBKEY_FILE")

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(ts)] $*" | tee -a "$LOG_FILE"; }

log "=== Capacity-catcher started ==="
log "shape=$SHAPE ocpus=$OCPUS ram=${RAM_GB}GB boot=${BOOT_VOLUME_GB}GB interval=${INTERVAL_SEC}s"

attempt=0
while true; do
    attempt=$((attempt + 1))

    OUT=$(oci compute instance launch \
        --availability-domain "$AD" \
        --compartment-id "$COMPARTMENT_ID" \
        --subnet-id "$SUBNET_ID" \
        --image-id "$IMAGE_ID" \
        --shape "$SHAPE" \
        --shape-config "{\"ocpus\":$OCPUS,\"memoryInGBs\":$RAM_GB}" \
        --display-name "$DISPLAY_NAME" \
        --assign-public-ip true \
        --boot-volume-size-in-gbs "$BOOT_VOLUME_GB" \
        --metadata "{\"ssh_authorized_keys\":\"$SSH_PUBKEY\"}" \
        --wait-for-state RUNNING \
        --max-wait-seconds 600 \
        2>&1)
    RC=$?

    if [ $RC -eq 0 ]; then
        log "=== SUCCESS on attempt #$attempt ==="
        echo "$OUT" | tee -a "$LOG_FILE"
        # Public IP
        INSTANCE_ID=$(echo "$OUT" | python -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null || echo "")
        if [ -n "$INSTANCE_ID" ]; then
            log "Instance OCID: $INSTANCE_ID"
            PUB_IP=$(oci compute instance list-vnics --instance-id "$INSTANCE_ID" \
                --query 'data[0]."public-ip"' --raw-output 2>/dev/null || echo "")
            log "Public IP: $PUB_IP"
        fi
        exit 0
    fi

    # Анализ ошибки. Transient (capacity / rate limit / сетевые таймауты)
    # ретраим. Hard-stop только на реальные конфигурационные проблемы:
    # auth, missing OCID и т.п. — там скрипт без вмешательства не выйдет.
    if echo "$OUT" | grep -qE "Out of (host )?capacity|TooManyRequests|InternalError|RequestException|timed out|timeout|Connection|EOF|503|502|500"; then
        log "attempt #$attempt: transient error, retry in ${INTERVAL_SEC}s"
    elif echo "$OUT" | grep -qE "NotAuthenticated|NotAuthorized|NotFound|InvalidParameter|LimitExceeded|QuotaExceeded"; then
        log "=== HARD ERROR on attempt #$attempt — stopping ==="
        echo "$OUT" | tee -a "$LOG_FILE"
        exit 1
    else
        log "attempt #$attempt: unknown error, retrying anyway in ${INTERVAL_SEC}s"
        echo "$OUT" | tail -5 | tee -a "$LOG_FILE"
    fi

    sleep "$INTERVAL_SEC"
done
