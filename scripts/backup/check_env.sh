#!/usr/bin/env bash
# Validate that backup scripts have the env they need before doing
# anything destructive (or noisy on stderr from inside a systemd unit).

set -euo pipefail

required=(
    YOS_ACCESS_KEY
    YOS_SECRET_KEY
    YOS_BUCKET
    YOS_ENDPOINT
    AGE_RECIPIENT
    POSTGRES_USER
    POSTGRES_DB
)

missing=()
for v in "${required[@]}"; do
    if [[ -z "${!v:-}" ]]; then
        missing+=("$v")
    fi
done

if (( ${#missing[@]} )); then
    echo "[check_env] missing env: ${missing[*]}" >&2
    echo "[check_env] expected in /etc/geobiom/.env.backup" >&2
    exit 1
fi

# Tools
for cmd in age rclone docker; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "[check_env] missing binary: $cmd" >&2
        exit 1
    fi
done
