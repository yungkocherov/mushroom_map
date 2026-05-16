-- 2026-05-17: forest stats snapshot (раздел «Статистика», вкладка
-- «Лес»). Наполняется pipelines/build_stats_snapshot.py из
-- forest_polygon (source='rosleshoz') + admin_area (level=6).
-- Только public.*. Все площади geodesic (ST_Area::geography).
-- Аудит данных: docs/superpowers/notes/2026-05-16-forest-data-audit.md

-- Перцентили per-polygon метрики по группе (box: p25/p50/p75 +
-- усы p10/p90). Единица — выдел, НЕ площадь-вес (idea 3/7/8).
CREATE TABLE IF NOT EXISTS stats_forest_quant (
    group_kind  TEXT NOT NULL,
    group_key   TEXT NOT NULL,
    metric      TEXT NOT NULL,
    n           BIGINT NOT NULL DEFAULT 0,
    p10 DOUBLE PRECISION, p25 DOUBLE PRECISION, p50 DOUBLE PRECISION,
    p75 DOUBLE PRECISION, p90 DOUBLE PRECISION,
    PRIMARY KEY (group_kind, group_key, metric)
);

-- 2-мерный кросс (площадь-взвешенный км²). Покрывает species×bonitet,
-- species×age, age×bonitet, district×species, district×age.
CREATE TABLE IF NOT EXISTS stats_forest_cross (
    dim_a   TEXT NOT NULL,
    key_a   TEXT NOT NULL,
    dim_b   TEXT NOT NULL,
    key_b   TEXT NOT NULL,
    area_km2      DOUBLE PRECISION NOT NULL DEFAULT 0,
    polygon_count BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (dim_a, key_a, dim_b, key_b)
);

-- Гистограмма запаса древесины (площадь-взвешенная), 20 м³/га бины.
CREATE TABLE IF NOT EXISTS stats_forest_hist (
    metric        TEXT NOT NULL,
    bin_lo        DOUBLE PRECISION NOT NULL,
    bin_hi        DOUBLE PRECISION NOT NULL,
    area_km2      DOUBLE PRECISION NOT NULL DEFAULT 0,
    polygon_count BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (metric, bin_lo)
);

-- Сводка по 18 районам ЛО.
CREATE TABLE IF NOT EXISTS stats_forest_district (
    district_id    INTEGER PRIMARY KEY,
    district_name  TEXT NOT NULL,
    land_km2       DOUBLE PRECISION NOT NULL DEFAULT 0,
    forest_km2     DOUBLE PRECISION NOT NULL DEFAULT 0,
    forest_pct     DOUBLE PRECISION NOT NULL DEFAULT 0,
    mean_bonitet   DOUBLE PRECISION,
    mean_stock     DOUBLE PRECISION,
    mature_host_pct DOUBLE PRECISION
);
