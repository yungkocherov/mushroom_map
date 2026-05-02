#!/usr/bin/env bash
# build_forest_tiles.sh — генерация forest.pmtiles через tippecanoe.
#
# Заменяет старый pipelines/build_tiles.py (47 мин) на цепочку:
#   1. psql → стримим forest_unified в линейный GeoJSON (~1 мин)
#   2. docker tippecanoe → MBTiles (~3-5 мин)
#   3. docker pmtiles convert → PMTiles (~30 сек)
#
# Tippecanoe сам делает coalesce-densest-as-needed на низких зумах: смежные
# полигоны одной породы склеиваются в массивы, мелочь дроп'ается, пока
# тайл не уложится в лимит 500КБ. Per-zoom буфер и prepared mask больше
# не нужны.
#
# Использование:
#   bash pipelines/build_forest_tiles.sh
#
# Env (опционально):
#   DATABASE_URL  (default: postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map)
#   OUT_DIR       (default: data/tiles)
#   MIN_ZOOM      (default: 5)
#   MAX_ZOOM      (default: 13)

set -euo pipefail

# DB-контейнер из docker-compose (см. CLAUDE.md). psql на Windows-хосте
# обычно отсутствует, поэтому дампим через docker exec — быстрее чем
# python psycopg + не требует zависимостей.
DB_CONTAINER="${DB_CONTAINER:-mushroom_db}"
DB_USER="${DB_USER:-mushroom}"
DB_NAME="${DB_NAME:-mushroom_map}"
OUT_DIR="${OUT_DIR:-data/tiles}"
MIN_ZOOM="${MIN_ZOOM:-5}"
MAX_ZOOM="${MAX_ZOOM:-13}"

GEOJSON_FILE="$OUT_DIR/forest.geojsonl"
MBTILES_FILE="$OUT_DIR/forest.mbtiles"
PMTILES_FILE="$OUT_DIR/forest.pmtiles"

mkdir -p "$OUT_DIR"

if ! command -v docker >/dev/null 2>&1; then
    echo "docker не установлен (нужен для tippecanoe + pmtiles)" >&2
    exit 1
fi

if ! docker ps --filter name="^${DB_CONTAINER}$" --format '{{.Names}}' | grep -q "$DB_CONTAINER"; then
    echo "контейнер $DB_CONTAINER не запущен (docker compose up -d db)" >&2
    exit 1
fi

t0=$(date +%s)
echo "[1/3] docker exec psql → $GEOJSON_FILE"
# row_to_json + ST_AsGeoJSON: строим Feature с минимально нужными properties.
# bonitet/age_group для frontend paint expressions; area_m2 для tippecanoe
# coalesce приоритета (-as сохраняет крупнейшие при drop).
docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -At -c "
COPY (
    SELECT row_to_json(f.*)
    FROM (
        SELECT
            'Feature'::text                                    AS type,
            ST_AsGeoJSON(fu.geometry, 6)::json                 AS geometry,
            json_build_object(
                'dominant_species', fu.dominant_species,
                'bonitet',          (fp.meta->>'bonitet')::int,
                'age_group',        fp.meta->>'age_group',
                'area_m2',          fu.area_m2
            )                                                  AS properties
        FROM forest_unified fu
        JOIN forest_polygon fp ON fp.id = fu.id
    ) f
) TO STDOUT
" > "$GEOJSON_FILE"

n_features=$(wc -l < "$GEOJSON_FILE")
echo "      $n_features features → $(du -h "$GEOJSON_FILE" | cut -f1)"

t1=$(date +%s)
echo "[2/3] tippecanoe → $MBTILES_FILE  (z=$MIN_ZOOM..$MAX_ZOOM)"
# Tippecanoe v1.24.1 (klokantech/tippecanoe). Минимальный набор флагов
# чтобы НИЧЕГО не дропалось/мержилось/упрощалось — каждый из 1.68M
# вы́делов должен оставаться отдельной MVT-feature на всех зумах:
#   -l forest                   — layer name (matches frontend source-layer)
#   --read-parallel             — параллельное чтение line-delimited GeoJSON
#   --no-tile-size-limit        — НЕ дропать features по размеру тайла
#   --no-feature-limit          — снять hard-limit 200000 features/tile.
#                                 На z=5 у нас один тайл = 1.34M вы́делов,
#                                 без флага tippecanoe бросает «too many
#                                 features» и дропает их
#   --no-tiny-polygon-reduction — НЕ заменять sub-pixel polygons на points
#                                 и не дропать их (default behavior дропает)
#   --no-line-simplification    — НЕ применять Douglas-Peucker (он
#                                 коллапсировал мелкие полигоны на низких
#                                 зумах в ничего)
# Что НАМЕРЕННО НЕ используется:
#   --coalesce          — сливал same-species соседей в общий MVT-feature
#                         → вы́делы «пропадали» при отзумивании
#   --gamma=N           — стохастически дропает features в плотных
#                         кластерах (power-law). С нашими 1.68M в ЛО это
#                         было видимо как «пропадание» вы́делов
#   --simplification=N  — Douglas-Peucker на низких зумах коллапсировал
#                         мелкие полигоны
#   --drop-*-as-needed  — любая логика drop'а features по тайл-лимиту
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd)/$OUT_DIR:/data" klokantech/tippecanoe \
    tippecanoe \
        -o "/data/forest.mbtiles" \
        -l forest \
        --minimum-zoom="$MIN_ZOOM" \
        --maximum-zoom="$MAX_ZOOM" \
        --no-tile-size-limit \
        --no-feature-limit \
        --no-tiny-polygon-reduction \
        --no-line-simplification \
        --read-parallel \
        --force \
        "/data/forest.geojsonl"

t2=$(date +%s)
TMP_PMTILES="$OUT_DIR/forest.pmtiles.tmp"
echo "[3/3] pmtiles convert → $TMP_PMTILES (atomic rename после verify)"
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd)/$OUT_DIR:/data" protomaps/go-pmtiles \
    convert "/data/forest.mbtiles" "/data/forest.pmtiles.tmp" --force

# Atomic rename: convert мог упасть в середине → старый forest.pmtiles
# остаётся валидным. Без atomic'а Caddy раздавал бы корраптный/zero-byte
# файл с `Cache-Control: immutable, max-age=86400` — кешировался у юзеров
# на сутки. Verify через `pmtiles show` (parseable header).
if [[ ! -s "$TMP_PMTILES" ]]; then
    echo "ERROR: $TMP_PMTILES пустой или отсутствует — convert провалился" >&2
    rm -f "$TMP_PMTILES"
    exit 1
fi

if ! MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd)/$OUT_DIR:/data" protomaps/go-pmtiles \
        show "/data/forest.pmtiles.tmp" >/dev/null 2>&1; then
    echo "ERROR: $TMP_PMTILES не парсится — pmtiles show упал" >&2
    rm -f "$TMP_PMTILES"
    exit 1
fi

mv -f "$TMP_PMTILES" "$PMTILES_FILE"

t3=$(date +%s)
size=$(du -h "$PMTILES_FILE" | cut -f1)

# Очистка промежуточных артефактов — pmtiles файла достаточно
rm -f "$GEOJSON_FILE" "$MBTILES_FILE"

echo ""
echo "done: $PMTILES_FILE ($size)"
echo "  geojson dump: $((t1 - t0))s"
echo "  tippecanoe:   $((t2 - t1))s"
echo "  pmtiles:      $((t3 - t2))s"
echo "  total:        $((t3 - t0))s"
