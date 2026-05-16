-- 2026-05-16: stats weather snapshot (раздел «Статистика», Phase 2).
--
-- LO-агрегат помесячной погоды для overview-хаба. Наполняется
-- pipelines/build_stats_snapshot.py из forecast.weather_daily
-- (сестринский репо, read-only, под to_regclass-guard). Мы НЕ пишем
-- forecast.*. year=0 — климатологическая норма (среднее по годам).
--
-- Per-district погода (профиль района) — Phase 3, отдельная миграция.

CREATE TABLE IF NOT EXISTS stats_weather_monthly (
    year             INTEGER NOT NULL,   -- 0 = климатология (норма)
    month            SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    temp_mean        DOUBLE PRECISION,
    precip_sum       DOUBLE PRECISION,
    soil_moist_mean  DOUBLE PRECISION,
    PRIMARY KEY (year, month)
);
