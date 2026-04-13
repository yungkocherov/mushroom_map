-- Наблюдения грибов — эмпирические данные.
-- Источники: VK посты (сейчас), iNaturalist/GBIF (потом), UGC от пользователей (потом).
--
-- Геометрия наблюдения хранится в двух видах:
--   point      — точная точка (если есть)
--   h3_cell    — H3 index ресолюшна 7 (~5 км²), хранится как TEXT (res7-индекс)
-- Если точки нет — privilegируем h3_cell по центру упомянутого топонима.

CREATE TABLE IF NOT EXISTS observation (
    id               BIGSERIAL PRIMARY KEY,
    region_id        INTEGER NOT NULL REFERENCES region(id) ON DELETE CASCADE,
    source           TEXT NOT NULL,                      -- 'vk' | 'inaturalist' | 'gbif' | 'ugc'
    source_ref       TEXT,                               -- VK post id / GBIF occurrence id / ...
    source_version   TEXT,                               -- 'vk-grib_spb-2026-04-13'

    species_id       INTEGER REFERENCES species(id),     -- NULL если вид ещё не распознан
    species_raw      TEXT,                               -- сырое название, как было в тексте

    -- Геометрия
    point            GEOMETRY(Point, 4326),              -- если есть точные координаты
    h3_cell          TEXT,                               -- H3 res 7 индекс (fallback)
    placename_raw    TEXT,                               -- извлечённый топоним
    placename_confidence REAL,                           -- насколько уверен NER/газеттир

    observed_on      DATE,                               -- дата похода
    observed_year    INTEGER GENERATED ALWAYS AS (EXTRACT(YEAR FROM observed_on)::int) STORED,
    observed_month   INTEGER GENERATED ALWAYS AS (EXTRACT(MONTH FROM observed_on)::int) STORED,

    count_estimate   INTEGER,                            -- если оценка количества есть
    quality          TEXT NOT NULL DEFAULT 'ok'
                     CHECK (quality IN ('low','ok','high')),

    text_excerpt     TEXT,                               -- кусок текста поста (для дебага)
    meta             JSONB NOT NULL DEFAULT '{}'::jsonb,

    ingested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (source, source_ref, species_id)
);

CREATE INDEX IF NOT EXISTS idx_observation_point    ON observation USING GIST (point);
CREATE INDEX IF NOT EXISTS idx_observation_h3       ON observation (h3_cell);
CREATE INDEX IF NOT EXISTS idx_observation_species  ON observation (species_id);
CREATE INDEX IF NOT EXISTS idx_observation_date     ON observation (observed_on);
CREATE INDEX IF NOT EXISTS idx_observation_region   ON observation (region_id);
CREATE INDEX IF NOT EXISTS idx_observation_year_mon ON observation (observed_year, observed_month);

-- ────────────────────────────────────────────────────────────────
-- Материализованная агрегация по H3-ячейке, виду и сезону.
-- Быстрый ответ на «что растёт в этой ячейке».
-- Обновляется после каждого запуска extract_places.
-- ────────────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS observation_h3_species_stats AS
SELECT
    region_id,
    h3_cell,
    species_id,
    observed_month,
    COUNT(*) AS n_observations,
    COUNT(DISTINCT observed_year) AS n_years,
    MIN(observed_on) AS first_seen,
    MAX(observed_on) AS last_seen
FROM observation
WHERE h3_cell IS NOT NULL AND species_id IS NOT NULL
GROUP BY region_id, h3_cell, species_id, observed_month;

CREATE INDEX IF NOT EXISTS idx_h3_stats_cell    ON observation_h3_species_stats (h3_cell);
CREATE INDEX IF NOT EXISTS idx_h3_stats_species ON observation_h3_species_stats (species_id);
CREATE INDEX IF NOT EXISTS idx_h3_stats_region  ON observation_h3_species_stats (region_id);

COMMENT ON MATERIALIZED VIEW observation_h3_species_stats IS
    'Агрегация наблюдений по H3-ячейке и виду. REFRESH MATERIALIZED VIEW после ingest.';
