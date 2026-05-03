#!/usr/bin/env bash
# sync_glyphs_to_vm.sh — заливка PBF-glyphs (Noto Sans / Bold / Italic)
# на TimeWeb VM. Caddy потом отдаёт через api.geobiom.ru/glyphs/{font}/{range}.pbf.
#
# Mobile basemap-place-names symbol-layer'ы запрашивают glyphs через
# https://api.geobiom.ru/glyphs/{fontstack}/{range}.pbf — нужны для
# подписей городов/рек на карте. На Phase 5 это online-only;
# offline-bundled — Phase 6.
#
# Использование:
#   bash scripts/deploy/sync_glyphs_to_vm.sh
#
# Env:
#   SSH_HOST   (default: geobiom-prod-timeweb)
#   REMOTE_DIR (default: /srv/mushroom-map/glyphs)
#   GLYPHS_DIR (default: data/glyphs)

set -euo pipefail

SSH_HOST="${SSH_HOST:-geobiom-prod-timeweb}"
REMOTE_DIR="${REMOTE_DIR:-/srv/mushroom-map/glyphs}"
GLYPHS_DIR="${GLYPHS_DIR:-data/glyphs}"

if [ ! -d "$GLYPHS_DIR" ]; then
    echo "GLYPHS_DIR=$GLYPHS_DIR не существует — сначала запусти scripts/download_glyphs.sh" >&2
    exit 1
fi

echo "[sync_glyphs] $SSH_HOST:$REMOTE_DIR/"
ssh "$SSH_HOST" "mkdir -p '$REMOTE_DIR'"

# Используем rsync если есть (incremental + progress), иначе scp.
if command -v rsync >/dev/null 2>&1; then
    echo "[sync_glyphs] Using rsync..."
    rsync -av --progress "$GLYPHS_DIR/" "$SSH_HOST:$REMOTE_DIR/"
else
    echo "[sync_glyphs] rsync не найден — fallback на scp -r (медленнее, без incremental)"
    scp -r "$GLYPHS_DIR/." "$SSH_HOST:$REMOTE_DIR/"
fi

echo "[sync_glyphs] Done. Теперь обнови Caddyfile на VM (если ещё не):"
echo "  sudo systemctl reload caddy.service"
echo
echo "Smoke test:"
echo "  curl -I 'https://api.geobiom.ru/glyphs/Noto%20Sans%20Regular/0-255.pbf'"
