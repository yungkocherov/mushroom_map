#!/usr/bin/env bash
# Скачивает готовые PBF-glyphs (sdf-шрифты для MapLibre) напрямую с
# fonts.openmaptiles.org/{fontstack}/{range}.pbf — без локальной генерации
# из TTF (которая требует node-fontnik + harfbuzz).
#
# Mobile basemap-place-* / water-name symbol-layer'ы запрашивают шрифты
# через api.geobiom.ru/glyphs/{fontstack}/{range}.pbf — туда статически
# раздаёт Caddy после sync_glyphs_to_vm.sh.
#
# Pack: Noto Sans Regular + Bold + Italic. Покрывают Cyrillic + Latin.
# Качаем только нужные диапазоны (Latin + Cyrillic + диакритика) — 6
# файлов на шрифт ~ 200-500 KB total. Остальное (CJK/Arabic) для ЛО
# не нужно.
#
# Output:
#   data/glyphs/Noto Sans Regular/{0-255,256-511,...}.pbf
#   data/glyphs/Noto Sans Bold/...
#   data/glyphs/Noto Sans Italic/...
#
# Usage:
#   bash scripts/download_glyphs.sh

set -euo pipefail

CDN="https://demotiles.maplibre.org/font"
OUT_DIR="data/glyphs"

FONTS=(
    "Noto Sans Regular"
    "Noto Sans Bold"
    "Noto Sans Italic"
)

# Реалистичные блоки:
# 0-255    Basic Latin + Latin-1
# 256-511  Latin Extended-A
# 512-767  Latin Extended-B / IPA
# 768-1023 Combining diacritics + Greek
# 1024-1279 Cyrillic
# 1280-1535 Cyrillic Supplement
# Покрывает 99% русских/английских топонимов.
RANGES=(
    "0-255"
    "256-511"
    "512-767"
    "768-1023"
    "1024-1279"
    "1280-1535"
)

mkdir -p "$OUT_DIR"

for font in "${FONTS[@]}"; do
    dest="$OUT_DIR/$font"
    mkdir -p "$dest"
    echo "[glyphs] $font"
    enc=$(printf '%s' "$font" | sed 's/ /%20/g')
    for range in "${RANGES[@]}"; do
        url="$CDN/$enc/$range.pbf"
        out="$dest/$range.pbf"
        if [ -s "$out" ]; then
            echo "  $range.pbf (cached)"
            continue
        fi
        if curl -sf -o "$out" "$url"; then
            sz=$(stat -c%s "$out" 2>/dev/null || stat -f%z "$out")
            echo "  $range.pbf ($sz B)"
        else
            echo "  $range.pbf FAILED — skipping" >&2
            rm -f "$out"
        fi
    done
done

echo "[glyphs] Done. Total: $(du -sh "$OUT_DIR" | cut -f1) in $OUT_DIR"
echo "[glyphs] Next: bash scripts/deploy/sync_glyphs_to_vm.sh"
