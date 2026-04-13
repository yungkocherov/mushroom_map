-- Агрегация наблюдений по региону и виду (без привязки к H3).
-- Используется для popapa «эмпирические виды» пока газеттир не заполнен.
-- После запуска NER + газеттира будет также работать H3-агрегация из миграции 005.

CREATE MATERIALIZED VIEW IF NOT EXISTS observation_region_species_stats AS
SELECT
    region_id,
    species_id,
    observed_month,
    COUNT(*)                        AS n_observations,
    COUNT(DISTINCT observed_year)   AS n_years,
    MIN(observed_on)                AS first_seen,
    MAX(observed_on)                AS last_seen
FROM observation
WHERE species_id IS NOT NULL
GROUP BY region_id, species_id, observed_month;

CREATE UNIQUE INDEX IF NOT EXISTS idx_region_stats_pk
    ON observation_region_species_stats (region_id, species_id, observed_month);

CREATE INDEX IF NOT EXISTS idx_region_stats_region
    ON observation_region_species_stats (region_id);

CREATE INDEX IF NOT EXISTS idx_region_stats_species
    ON observation_region_species_stats (species_id);

COMMENT ON MATERIALIZED VIEW observation_region_species_stats IS
    'Региональная агрегация: сколько раз вид встречался в регионе по месяцам.
     Fallback пока h3_cell не заполнен из газеттира.
     REFRESH MATERIALIZED VIEW CONCURRENTLY observation_region_species_stats после ingest.';
