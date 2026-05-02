#!/usr/bin/env bash
# build_forest_lo_tiles.sh — собирает forest_lo.pmtiles для зумов 5-7.
#
# Зачем: forest.pmtiles (1.68M вы́делов, 737 МБ) на z=5-7 даёт тайлы
# 5-15 МБ — браузер парсит несколько секунд на тайл. Наш layer там
# рисуется крупнее пикселя, но всё равно загружается долго.
#
# Решение: на z=5-7 показываем same-species union вместо real-вы́делов.
# Свободно блюрятся под пиксельный рисунок но при этом тайл становится
# 100-500 КБ вместо 5-15 МБ — загрузка ×10-30 быстрее.
#
# На z>=8 фронт переключается обратно на forest.pmtiles (полная детализация
# каждого вы́дела).
#
# SQL: GROUP BY dominant_species → ST_Union → ST_Subdivide(1024 vertices).
# 14 пород × ~10-50 чанков subdivide'а = ~150 features против 1.68M.

set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-mushroom_db}"
DB_USER="${DB_USER:-mushroom}"
DB_NAME="${DB_NAME:-mushroom_map}"
OUT_DIR="${OUT_DIR:-data/tiles}"
MIN_ZOOM=5
MAX_ZOOM=7

GEOJSON_FILE="$OUT_DIR/forest_lo.geojsonl"
MBTILES_FILE="$OUT_DIR/forest_lo.mbtiles"
PMTILES_FILE="$OUT_DIR/forest_lo.pmtiles"

mkdir -p "$OUT_DIR"

t0=$(date +%s)
echo "[1/3] SQL ST_Union(GROUP BY dominant_species) + ST_Subdivide → $GEOJSON_FILE"
docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -At -c "
COPY (
    SELECT row_to_json(f.*)
    FROM (
        SELECT
            'Feature'::text                                    AS type,
            ST_AsGeoJSON(geom, 6)::json                        AS geometry,
            json_build_object(
                'dominant_species', dominant_species
            )                                                  AS properties
        FROM (
            SELECT
                COALESCE(dominant_species, 'mixed')            AS dominant_species,
                ST_Subdivide(ST_Union(geometry), 1024)         AS geom
            FROM forest_unified
            GROUP BY COALESCE(dominant_species, 'mixed')
        ) sub
    ) f
) TO STDOUT
" > "$GEOJSON_FILE"

n_features=$(wc -l < "$GEOJSON_FILE")
echo "      $n_features features → $(du -h "$GEOJSON_FILE" | cut -f1)"

t1=$(date +%s)
echo "[2/3] tippecanoe → $MBTILES_FILE (z=$MIN_ZOOM..$MAX_ZOOM)"
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd)/$OUT_DIR:/data" klokantech/tippecanoe \
    tippecanoe \
        -o "/data/forest_lo.mbtiles" \
        -l forest_lo \
        --minimum-zoom="$MIN_ZOOM" \
        --maximum-zoom="$MAX_ZOOM" \
        --no-tile-size-limit \
        --no-feature-limit \
        --no-tiny-polygon-reduction \
        --no-line-simplification \
        --read-parallel \
        --force \
        "/data/forest_lo.geojsonl" 2>&1 | tail -3

t2=$(date +%s)
echo "[3/3] pmtiles convert → $PMTILES_FILE"
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd)/$OUT_DIR:/data" protomaps/go-pmtiles \
    convert "/data/forest_lo.mbtiles" "/data/forest_lo.pmtiles" --force 2>&1 | tail -2

t3=$(date +%s)
size=$(du -h "$PMTILES_FILE" | cut -f1)

rm -f "$GEOJSON_FILE" "$MBTILES_FILE"

echo ""
echo "done: $PMTILES_FILE ($size)"
echo "  sql+geojson: $((t1 - t0))s"
echo "  tippecanoe:  $((t2 - t1))s"
echo "  pmtiles:     $((t3 - t2))s"
echo "  total:       $((t3 - t0))s"
