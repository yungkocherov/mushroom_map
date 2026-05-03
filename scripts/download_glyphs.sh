#!/usr/bin/env bash
#
# Скачивает PBF-glyphs (sdf-шрифты для MapLibre) из openmaptiles/fonts.
# Используется и web (если нужен offline-host вместо CDN), и mobile
# (basemap-place-names для labels на карте через api.geobiom.ru/glyphs/).
#
# Pack: Noto Sans Regular + Noto Sans Bold + Noto Sans Italic. Покрывают
# Cyrillic + Latin + большинство юнікод-blocks. Размер ~5-10 MB на шрифт
# (256 PBF файлов по ~30-300 KB).
#
# Output:
#   data/glyphs/Noto Sans Regular/{0-255,256-511,...}.pbf
#   data/glyphs/Noto Sans Bold/...
#   data/glyphs/Noto Sans Italic/...
#
# Usage:
#   bash scripts/download_glyphs.sh
#
# После — sync на VM:
#   bash scripts/deploy/sync_glyphs_to_vm.sh
#
set -euo pipefail

REPO="https://github.com/openmaptiles/fonts"
TMP="$(mktemp -d)"
trap "rm -rf $TMP" EXIT

OUT_DIR="data/glyphs"
mkdir -p "$OUT_DIR"

# Список нужных шрифтов. Имена соответствуют openmaptiles репозиторию.
FONTS=(
    "noto-sans-regular"
    "noto-sans-bold"
    "noto-sans-italic"
)

echo "[glyphs] Cloning openmaptiles/fonts (sparse — ~50 MB)..."
git clone --depth 1 --filter=blob:none "$REPO" "$TMP/fonts" 2>&1 | tail -3

for font in "${FONTS[@]}"; do
    src="$TMP/fonts/$font"
    if [ ! -d "$src" ]; then
        echo "[glyphs] WARNING: $font not found in repo, skipping"
        continue
    fi
    # Преобразуем kebab-case → human "Noto Sans Regular"
    dest_name=$(echo "$font" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)} 1')
    dest="$OUT_DIR/$dest_name"
    echo "[glyphs] Copying $font -> $dest"
    rm -rf "$dest"
    cp -r "$src" "$dest"
    n=$(ls "$dest"/*.pbf 2>/dev/null | wc -l)
    size=$(du -sh "$dest" | cut -f1)
    echo "  $n .pbf files, $size total"
done

echo "[glyphs] Done. Output in $OUT_DIR"
echo "[glyphs] Next: bash scripts/deploy/sync_glyphs_to_vm.sh"
