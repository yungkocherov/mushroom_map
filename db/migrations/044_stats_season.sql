-- 2026-05-16: seasonality snapshot (раздел «Статистика», вкладка
-- «Сезонность», Phase 3). Spine = species x year x ISO-week.
-- Наполняется pipelines/build_stats_snapshot.py из vk_post
-- (photo_species, COALESCE(foray_date, date_ts MSK)). Только public.*.

CREATE TABLE IF NOT EXISTS stats_season_week (
    species_key  TEXT     NOT NULL,
    year         SMALLINT NOT NULL,
    week         SMALLINT NOT NULL CHECK (week BETWEEN 1 AND 53),
    posts        INTEGER  NOT NULL DEFAULT 0,
    finds        INTEGER  NOT NULL DEFAULT 0,
    PRIMARY KEY (species_key, year, week)
);
CREATE INDEX IF NOT EXISTS idx_season_week_yr ON stats_season_week (year, week);

CREATE TABLE IF NOT EXISTS stats_season_norm (
    species_key  TEXT     NOT NULL,
    week         SMALLINT NOT NULL CHECK (week BETWEEN 1 AND 53),
    finds_mean   DOUBLE PRECISION NOT NULL DEFAULT 0,
    finds_p25    DOUBLE PRECISION NOT NULL DEFAULT 0,
    finds_p75    DOUBLE PRECISION NOT NULL DEFAULT 0,
    PRIMARY KEY (species_key, week)
);

CREATE TABLE IF NOT EXISTS stats_season_species (
    species_key        TEXT PRIMARY KEY,
    total_posts        INTEGER NOT NULL DEFAULT 0,
    n_years            SMALLINT NOT NULL DEFAULT 0,
    n_years_qual       SMALLINT NOT NULL DEFAULT 0,
    peak_week_median   DOUBLE PRECISION,
    peak_week_iqr      DOUBLE PRECISION,
    peak_trend_slope   DOUBLE PRECISION,
    season_len_median  DOUBLE PRECISION,
    qualifies          BOOLEAN NOT NULL DEFAULT FALSE
);
