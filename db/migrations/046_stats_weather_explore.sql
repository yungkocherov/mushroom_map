-- 2026-05-17: stats «Погода» explore snapshot (раздел «Статистика»).
--
-- LO-агрегат + per-district погода из forecast.weather_daily
-- (сестринский репо, read-only, под to_regclass-guard в pipeline).
-- Мы НЕ пишем forecast.*. Полные годы 2018-2025 — базовая линия;
-- 2026 частичный (is_partial=true, фронт убирает из баров).
-- Существующий stats_weather_monthly (043) не трогаем.

CREATE TABLE IF NOT EXISTS stats_weather_clim (
    month         SMALLINT PRIMARY KEY CHECK (month BETWEEN 1 AND 12),
    t_mean        DOUBLE PRECISION,
    t_min         DOUBLE PRECISION,
    t_max         DOUBLE PRECISION,
    precip        DOUBLE PRECISION,
    soil_moist    DOUBLE PRECISION,
    p_minus_et0   DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS stats_weather_year (
    year                   SMALLINT PRIMARY KEY,
    is_partial             BOOLEAN NOT NULL DEFAULT FALSE,
    t_mean                 DOUBLE PRECISION,
    t_anom                 DOUBLE PRECISION,
    precip_total           DOUBLE PRECISION,
    precip_anom            DOUBLE PRECISION,
    warm_days              INTEGER,
    warm_soil_moist        DOUBLE PRECISION,
    rainy_days_warm        INTEGER,
    snow_days              INTEGER,
    last_spring_frost_doy  INTEGER,
    first_autumn_frost_doy INTEGER
);

CREATE TABLE IF NOT EXISTS stats_weather_ym (
    year          SMALLINT NOT NULL,
    month         SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    t_mean        DOUBLE PRECISION,
    precip_total  DOUBLE PRECISION,
    PRIMARY KEY (year, month)
);

CREATE TABLE IF NOT EXISTS stats_weather_gdd (
    year       SMALLINT NOT NULL,
    month      SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    gdd5_cum   DOUBLE PRECISION,
    PRIMARY KEY (year, month)
);

CREATE TABLE IF NOT EXISTS stats_weather_precip_hist (
    bin_lo  INTEGER PRIMARY KEY,   -- left edge, mm/day (open-ended top bin)
    days    INTEGER
);

CREATE TABLE IF NOT EXISTS stats_weather_district (
    district_id      INTEGER PRIMARY KEY,
    warm_precip      DOUBLE PRECISION,
    warm_soil_moist  DOUBLE PRECISION,
    mushroom_days    DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS stats_weather_district_month (
    district_id  INTEGER NOT NULL,
    month        SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    soil_moist   DOUBLE PRECISION,
    soil_temp    DOUBLE PRECISION,
    PRIMARY KEY (district_id, month)
);
