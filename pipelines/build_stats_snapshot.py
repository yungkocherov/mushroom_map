"""
build_stats_snapshot: пересчитывает агрегаты раздела «Статистика» и
складывает их в public.stats_* (миграция 042). Идемпотентно — каждый
прогон делает TRUNCATE + INSERT в одной транзакции на таблицу.

Запускать после VK-ingest / forest re-ingest или по расписанию:

    python pipelines/build_stats_snapshot.py

DSN: --dsn -> DATABASE_URL -> POSTGRES_* -> dev-дефолт (порт 5434).

Phase 1: только public.*. Тяжёлый SUM(ST_Area) по forest_unified
(~2.17M) исполняется ОДИН раз здесь (offline), не на каждый
API-запрос. forecast.* (погода) подключит Phase 2.
"""

from __future__ import annotations

import argparse
import time

import psycopg

from db_utils import resolve_dsn


# Каждый шаг: (table, sql). sql ПОЛНОСТЬЮ заменяет содержимое таблицы
# (одна INSERT ... SELECT). Никаких '%' — psycopg3 conn.execute без
# параметров парсит '%' как placeholder и падает.
_META_SQL = """
    INSERT INTO stats_meta (key, generated_at, forest_source_version, vk_prompt_version)
    SELECT
        'snapshot',
        now(),
        (SELECT source_version
           FROM forest_polygon
          GROUP BY source_version
          ORDER BY COUNT(*) DESC
          LIMIT 1),
        (SELECT photo_prompt_version
           FROM vk_post
          WHERE photo_prompt_version IS NOT NULL
          ORDER BY photo_processed_at DESC NULLS LAST
          LIMIT 1)
"""

_FOREST_SQL = """
    INSERT INTO stats_forest (dimension, bucket_key, label, area_km2, polygon_count)
    WITH base AS (
        SELECT
            dominant_species,
            source,
            meta->>'bonitet'   AS bonitet,
            meta->>'age_group' AS age_group,
            ST_Area(geometry::geography) / 1e6 AS km2
        FROM forest_unified
    ),
    species_dim AS (
        SELECT 'species' AS dimension,
               COALESCE(dominant_species, 'unknown') AS bucket_key,
               COALESCE(dominant_species, 'unknown') AS label,
               SUM(km2) AS area_km2,
               COUNT(*) AS polygon_count
        FROM base GROUP BY 1, 2, 3
    ),
    source_dim AS (
        SELECT 'source',
               COALESCE(source, 'unknown'),
               COALESCE(source, 'unknown'),
               SUM(km2), COUNT(*)
        FROM base GROUP BY 1, 2, 3
    ),
    bonitet_dim AS (
        SELECT 'bonitet',
               COALESCE(bonitet, 'unknown'),
               COALESCE(bonitet, 'unknown'),
               SUM(km2), COUNT(*)
        FROM base GROUP BY 1, 2, 3
    ),
    age_dim AS (
        SELECT 'age_group',
               COALESCE(age_group, 'unknown'),
               COALESCE(age_group, 'unknown'),
               SUM(km2), COUNT(*)
        FROM base GROUP BY 1, 2, 3
    )
    SELECT * FROM species_dim
    UNION ALL SELECT * FROM source_dim
    UNION ALL SELECT * FROM bonitet_dim
    UNION ALL SELECT * FROM age_dim
"""

_VK_TIMELINE_SQL = """
    INSERT INTO stats_vk_timeline (bucket, group_key, post_count, find_count)
    WITH posts AS (
        SELECT
            id,
            COALESCE(
                foray_date,
                (date_ts AT TIME ZONE 'Europe/Moscow')::date
            ) AS d,
            photo_species
        FROM vk_post
        WHERE photo_species IS NOT NULL
          AND jsonb_array_length(photo_species) > 0
    ),
    exploded AS (
        SELECT
            date_trunc('week', p.d)::date AS bucket,
            (s->>'species')::text         AS group_key,
            p.id                          AS post_id,
            COALESCE((s->>'count')::int, 0) AS cnt
        FROM posts p,
             LATERAL jsonb_array_elements(p.photo_species) s
        WHERE s->>'species' IS NOT NULL
          AND s->>'species' <> 'other'
          AND p.d IS NOT NULL
    )
    SELECT
        bucket,
        group_key,
        COUNT(DISTINCT post_id) AS post_count,
        SUM(cnt)                AS find_count
    FROM exploded
    GROUP BY bucket, group_key
"""

_CORPUS_SQL = """
    INSERT INTO stats_corpus (metric, value_num, value_text, detail)
    SELECT 'posts_total',
           (SELECT COUNT(*) FROM vk_post),
           NULL, '{}'::jsonb
    UNION ALL
    SELECT 'posts_classified',
           (SELECT COUNT(*) FROM vk_post WHERE photo_species IS NOT NULL),
           NULL, '{}'::jsonb
    UNION ALL
    SELECT 'forest_polygon_count',
           (SELECT COUNT(*) FROM forest_unified),
           NULL, '{}'::jsonb
    UNION ALL
    SELECT 'forest_area_km2',
           (SELECT COALESCE(SUM(ST_Area(geometry::geography)), 0) / 1e6
              FROM forest_unified),
           NULL, '{}'::jsonb
    UNION ALL
    SELECT 'species_count',
           (SELECT COUNT(*) FROM species),
           NULL, '{}'::jsonb
    UNION ALL
    SELECT 'district_count',
           (SELECT COUNT(*) FROM admin_area WHERE level = 6),
           NULL, '{}'::jsonb
    UNION ALL
    SELECT 'forest_sources',
           NULL, NULL,
           COALESCE((
               SELECT jsonb_object_agg(source, n)
               FROM (
                   SELECT COALESCE(source, 'unknown') AS source, COUNT(*) AS n
                   FROM forest_polygon GROUP BY 1
               ) t
           ), '{}'::jsonb)
    UNION ALL
    SELECT 'classification_distribution',
           NULL, NULL,
           COALESCE((
               SELECT jsonb_agg(jsonb_build_object('species_key', sk, 'count', n)
                                ORDER BY n DESC)
               FROM (
                   SELECT (s->>'species')::text AS sk,
                          SUM(COALESCE((s->>'count')::int, 0)) AS n
                   FROM vk_post v,
                        LATERAL jsonb_array_elements(v.photo_species) s
                   WHERE v.photo_species IS NOT NULL
                     AND s->>'species' IS NOT NULL
                     AND s->>'species' <> 'other'
                   GROUP BY 1
               ) d
           ), '[]'::jsonb)
"""

_WEATHER_SQL = """
    INSERT INTO stats_weather_monthly (year, month, temp_mean, precip_mean, soil_moist_mean)
    WITH src AS (
        SELECT
            EXTRACT(YEAR  FROM date)::int AS y,
            EXTRACT(MONTH FROM date)::int AS m,
            temperature_2m_mean      AS t,
            precipitation_sum        AS p,
            soil_moisture_1_to_3cm   AS sm
        FROM forecast.weather_daily
        WHERE to_regclass('forecast.weather_daily') IS NOT NULL
    ),
    per_year AS (
        SELECT y, m,
               AVG(t)  AS temp_mean,
               AVG(p)  AS precip_mean,
               AVG(sm) AS soil_moist_mean
        FROM src
        GROUP BY y, m
    ),
    climatology AS (
        SELECT 0 AS y, m,
               AVG(temp_mean)       AS temp_mean,
               AVG(precip_mean)     AS precip_mean,
               AVG(soil_moist_mean) AS soil_moist_mean
        FROM per_year
        GROUP BY m
    )
    SELECT y, m, temp_mean, precip_mean, soil_moist_mean FROM per_year
    UNION ALL
    SELECT y, m, temp_mean, precip_mean, soil_moist_mean FROM climatology
"""

# «Погода» explore snapshot (миграция 046). Все четыре читают только
# forecast.weather_daily (сестринский репо, read-only; skip-if-absent
# через _FORECAST_GUARDED). Сначала усредняем 18 районов по date (CTE
# `day`) — LO-агрегат это истинное среднее по площади, — затем
# агрегируем за период. Только полные годы 2018-2025.
# psycopg3-trap: эти константы исполняются через cur.execute(sql) без
# параметров — НИ ОДНОГО символа `%` (no LIKE, no `%`-casts).

# precip * 30.4 переводит среднесуточные осадки в репрезентативную
# месячную сумму (≈ среднее число дней в месяце); p_minus_et0 — так же.
_WEATHER_CLIM_SQL = """
    INSERT INTO stats_weather_clim
        (month, t_mean, t_min, t_max, precip, soil_moist, p_minus_et0)
    WITH day AS (
        SELECT date,
               AVG(temperature_2m_mean)    AS t_mean,
               AVG(temperature_2m_min)     AS t_min,
               AVG(temperature_2m_max)     AS t_max,
               AVG(precipitation_sum)      AS precip,
               AVG(soil_moisture_1_to_3cm) AS soil_moist,
               AVG(precipitation_sum) - AVG(et0_fao_evapotranspiration)
                                           AS p_minus_et0
        FROM forecast.weather_daily
        WHERE date >= DATE '2018-01-01' AND date < DATE '2026-01-01'
        GROUP BY date
    )
    SELECT EXTRACT(MONTH FROM date)::int AS month,
           AVG(t_mean), AVG(t_min), AVG(t_max),
           AVG(precip) * 30.4, AVG(soil_moist), AVG(p_minus_et0) * 30.4
    FROM day
    GROUP BY 1
    ORDER BY 1
"""

_WEATHER_YM_SQL = """
    INSERT INTO stats_weather_ym (year, month, t_mean, precip_total)
    WITH day AS (
        SELECT date,
               AVG(temperature_2m_mean) AS t_mean,
               AVG(precipitation_sum)   AS precip
        FROM forecast.weather_daily
        WHERE date >= DATE '2018-01-01' AND date < DATE '2026-01-01'
        GROUP BY date
    )
    SELECT EXTRACT(YEAR FROM date)::int,
           EXTRACT(MONTH FROM date)::int,
           AVG(t_mean), SUM(precip)
    FROM day
    GROUP BY 1, 2
    ORDER BY 1, 2
"""

_WEATHER_GDD_SQL = """
    INSERT INTO stats_weather_gdd (year, month, gdd5_cum)
    WITH day AS (
        SELECT date,
               GREATEST(AVG(temperature_2m_mean) - 5.0, 0.0) AS gdd
        FROM forecast.weather_daily
        WHERE date >= DATE '2018-01-01' AND date < DATE '2026-01-01'
        GROUP BY date
    ),
    monthly AS (
        SELECT EXTRACT(YEAR FROM date)::int  AS y,
               EXTRACT(MONTH FROM date)::int AS m,
               SUM(gdd)                      AS gdd_m
        FROM day GROUP BY 1, 2
    )
    SELECT y, m,
           SUM(gdd_m) OVER (PARTITION BY y ORDER BY m
                            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
    FROM monthly
    ORDER BY y, m
"""

# Открытый верхний бин: LEAST(..., 30) сворачивает все дни >=30 мм/сут
# в один бакет bin_lo=30 (фронт подписывает как «30+»).
_WEATHER_PRECIP_HIST_SQL = """
    INSERT INTO stats_weather_precip_hist (bin_lo, days)
    WITH day AS (
        SELECT date, AVG(precipitation_sum) AS precip
        FROM forecast.weather_daily
        WHERE date >= DATE '2018-01-01' AND date < DATE '2026-01-01'
          AND EXTRACT(MONTH FROM date) BETWEEN 6 AND 9
        GROUP BY date
    )
    SELECT LEAST(FLOOR(precip / 2.0)::int * 2, 30) AS bin_lo,
           COUNT(*)::int
    FROM day
    GROUP BY 1
    ORDER BY 1
"""

# stats_weather_year: 2018-2026; строка 2026 имеет is_partial=true
# (частичный год до 11 мая — фронт убирает из баров). Аномалии — vs
# среднее 2018-2025 (CTE `base`). Frost DOY: последний весенний
# заморозок = max день-года в янв-июн с t_min < 0; первый осенний =
# min день-года в июл-дек с t_min < 0. mushroom_days (per district) =
# число дней авг-сен с soil_moisture_1_to_3cm > 0.30 И
# soil_temperature_6cm в [8,18], усреднённое по годам (полные годы).
_WEATHER_YEAR_SQL = """
    INSERT INTO stats_weather_year
        (year, is_partial, t_mean, t_anom, precip_total, precip_anom,
         warm_days, warm_soil_moist, rainy_days_warm, snow_days,
         last_spring_frost_doy, first_autumn_frost_doy)
    WITH day AS (
        SELECT date,
               EXTRACT(YEAR FROM date)::int        AS y,
               EXTRACT(DOY  FROM date)::int        AS doy,
               EXTRACT(MONTH FROM date)::int       AS m,
               AVG(temperature_2m_mean)            AS t_mean,
               AVG(temperature_2m_min)             AS t_min,
               AVG(precipitation_sum)              AS precip,
               AVG(soil_moisture_1_to_3cm)         AS sm,
               AVG(snow_depth)                     AS snow
        FROM forecast.weather_daily
        GROUP BY date
    ),
    per_year AS (
        SELECT y,
               (y = 2026)                                  AS is_partial,
               AVG(t_mean)                                 AS t_mean,
               SUM(precip)                                 AS precip_total,
               COUNT(*) FILTER (WHERE t_mean >= 10)         AS warm_days,
               AVG(sm) FILTER (WHERE m BETWEEN 6 AND 9)     AS warm_sm,
               COUNT(*) FILTER (WHERE m BETWEEN 6 AND 9
                                  AND precip >= 1.0)        AS rainy_warm,
               COUNT(*) FILTER (WHERE snow > 0)             AS snow_days,
               MAX(doy) FILTER (WHERE m <= 6 AND t_min < 0) AS last_spring,
               MIN(doy) FILTER (WHERE m >= 7 AND t_min < 0) AS first_autumn
        FROM day GROUP BY y
    ),
    base AS (
        SELECT AVG(t_mean) AS t_base, AVG(precip_total) AS p_base
        FROM per_year WHERE y BETWEEN 2018 AND 2025
    )
    SELECT p.y, p.is_partial, p.t_mean, p.t_mean - b.t_base,
           p.precip_total, p.precip_total - b.p_base,
           p.warm_days, p.warm_sm, p.rainy_warm, p.snow_days,
           p.last_spring, p.first_autumn
    FROM per_year p CROSS JOIN base b
    ORDER BY p.y
"""

_WEATHER_DISTRICT_SQL = """
    INSERT INTO stats_weather_district
        (district_id, warm_precip, warm_soil_moist, mushroom_days)
    WITH quality AS (
        -- Degraded-source guard. A real LO soil-moisture series has a
        -- strong seasonal swing (genuine districts: sm_sd 0.042..0.064,
        -- max ~0.43). Upstream model emits flat/near-constant fill on
        -- no-soil grid cells (artifacts: Kirovsky sd 0.000 max 0.05,
        -- Volkhovsky sd 0.006 max 0.14). The 7x gap makes sm_sd < 0.02
        -- a safe cut (3x margin both sides) -> NULL the bad districts.
        SELECT district_id,
               COUNT(soil_moisture_1_to_3cm)  AS sm_n,
               STDDEV_POP(soil_moisture_1_to_3cm) AS sm_sd
        FROM forecast.weather_daily
        WHERE date >= DATE '2018-01-01' AND date < DATE '2026-01-01'
        GROUP BY district_id
    ),
    per_year AS (
        SELECT district_id,
               EXTRACT(YEAR FROM date)::int AS y,
               SUM(precipitation_sum) FILTER (
                   WHERE EXTRACT(MONTH FROM date) BETWEEN 6 AND 9) AS warm_p,
               AVG(soil_moisture_1_to_3cm) FILTER (
                   WHERE EXTRACT(MONTH FROM date) BETWEEN 6 AND 9) AS warm_sm,
               COUNT(*) FILTER (
                   WHERE EXTRACT(MONTH FROM date) BETWEEN 8 AND 9
                     AND soil_moisture_1_to_3cm > 0.30
                     AND soil_temperature_6cm BETWEEN 8 AND 18) AS mush
        FROM forecast.weather_daily
        WHERE date >= DATE '2018-01-01' AND date < DATE '2026-01-01'
        GROUP BY district_id, y
    )
    SELECT p.district_id,
           AVG(p.warm_p),
           CASE WHEN q.sm_n = 0 OR q.sm_sd < 0.02
                THEN NULL ELSE AVG(p.warm_sm) END,
           CASE WHEN q.sm_n = 0 OR q.sm_sd < 0.02
                THEN NULL ELSE AVG(p.mush) END
    FROM per_year p
    JOIN quality q ON q.district_id = p.district_id
    GROUP BY p.district_id, q.sm_n, q.sm_sd
    ORDER BY p.district_id
"""

_WEATHER_DISTRICT_MONTH_SQL = """
    INSERT INTO stats_weather_district_month
        (district_id, month, soil_moist, soil_temp)
    WITH quality AS (
        SELECT district_id,
               COUNT(soil_moisture_1_to_3cm)  AS sm_n,
               STDDEV_POP(soil_moisture_1_to_3cm) AS sm_sd,
               COUNT(soil_temperature_6cm)    AS st_n,
               STDDEV_POP(soil_temperature_6cm) AS st_sd
        FROM forecast.weather_daily
        WHERE date >= DATE '2018-01-01' AND date < DATE '2026-01-01'
        GROUP BY district_id
    ),
    per_month AS (
        SELECT district_id,
               EXTRACT(MONTH FROM date)::int AS m,
               AVG(soil_moisture_1_to_3cm) AS sm,
               AVG(soil_temperature_6cm)   AS st
        FROM forecast.weather_daily
        WHERE date >= DATE '2018-01-01' AND date < DATE '2026-01-01'
        GROUP BY district_id, EXTRACT(MONTH FROM date)
    )
    SELECT pm.district_id, pm.m,
           CASE WHEN q.sm_n = 0 OR q.sm_sd < 0.02
                THEN NULL ELSE pm.sm END,
           CASE WHEN q.st_n = 0 OR q.st_sd < 0.05
                THEN NULL ELSE pm.st END
    FROM per_month pm
    JOIN quality q ON q.district_id = pm.district_id
    ORDER BY pm.district_id, pm.m
"""

_SEASON_WEEK_SQL = """
    INSERT INTO stats_season_week (species_key, year, week, posts, finds)
    WITH e AS (
        SELECT (s->>'species')::text AS sk,
               COALESCE(v.foray_date,
                 (v.date_ts AT TIME ZONE 'Europe/Moscow')::date) AS d,
               v.id AS pid,
               COALESCE((s->>'count')::int, 0) AS cnt
        FROM vk_post v, LATERAL jsonb_array_elements(v.photo_species) s
        WHERE v.photo_species IS NOT NULL
          AND s->>'species' IS NOT NULL AND s->>'species' <> 'other'
    )
    SELECT sk,
           EXTRACT(YEAR FROM d)::smallint,
           EXTRACT(WEEK FROM d)::smallint,
           count(DISTINCT pid)::int,
           sum(cnt)::int
    FROM e
    WHERE d IS NOT NULL AND EXTRACT(YEAR FROM d) >= 2018
    GROUP BY 1, 2, 3
"""

_SEASON_NORM_SQL = """
    INSERT INTO stats_season_norm (species_key, week, finds_mean, finds_p25, finds_p75)
    WITH sm AS (
        SELECT species_key, year, week,
               AVG(finds) OVER (
                 PARTITION BY species_key, year
                 ORDER BY week ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING
               ) AS f7
        FROM stats_season_week
        WHERE year BETWEEN 2018 AND 2025
    )
    SELECT species_key, week,
           AVG(f7),
           percentile_cont(0.25) WITHIN GROUP (ORDER BY f7),
           percentile_cont(0.75) WITHIN GROUP (ORDER BY f7)
    FROM sm
    GROUP BY species_key, week
"""

_SEASON_SPECIES_SQL = """
    INSERT INTO stats_season_species
      (species_key, total_posts, n_years, n_years_qual,
       peak_week_median, peak_week_iqr, peak_trend_slope,
       season_len_median, qualifies)
    WITH base AS (
        SELECT species_key, year, week, posts, finds
        FROM stats_season_week
        WHERE year BETWEEN 2018 AND 2025
    ),
    sm AS (
        SELECT species_key, year, week, posts, finds,
               AVG(finds) OVER (
                 PARTITION BY species_key, year
                 ORDER BY week ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING) AS f7,
               SUM(posts) OVER (PARTITION BY species_key, year) AS yr_posts,
               SUM(finds) OVER (PARTITION BY species_key, year) AS yr_finds,
               SUM(finds) OVER (PARTITION BY species_key, year
                                ORDER BY week) AS cum_finds
        FROM base
    ),
    ranked AS (
        SELECT species_key, year, week, f7, cum_finds, yr_posts, yr_finds,
               ROW_NUMBER() OVER (PARTITION BY species_key, year
                                  ORDER BY f7 DESC, week) AS rnk
        FROM sm
    ),
    peak AS (
        SELECT species_key, year,
               MIN(yr_posts) AS yr_posts,
               MAX(week) FILTER (WHERE rnk = 1) AS peak_week
        FROM ranked GROUP BY species_key, year
    ),
    bounds AS (
        SELECT species_key, year,
               MIN(week) FILTER (WHERE yr_finds > 0
                                 AND cum_finds >= 0.10 * yr_finds) AS w10,
               MIN(week) FILTER (WHERE yr_finds > 0
                                 AND cum_finds >= 0.90 * yr_finds) AS w90
        FROM sm GROUP BY species_key, year
    ),
    per_year AS (
        SELECT p.species_key, p.year, p.yr_posts, p.peak_week,
               (b.w90 - b.w10) AS season_len
        FROM peak p JOIN bounds b USING (species_key, year)
    ),
    qual AS (
        SELECT species_key,
               count(*) AS n_years_qual,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY peak_week) AS pk_med,
               percentile_cont(0.75) WITHIN GROUP (ORDER BY peak_week)
                 - percentile_cont(0.25) WITHIN GROUP (ORDER BY peak_week) AS pk_iqr,
               regr_slope(peak_week, year) AS slope,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY season_len) AS len_med
        FROM per_year WHERE yr_posts >= 20
        GROUP BY species_key
    ),
    tot AS (
        SELECT species_key, SUM(posts)::int AS total_posts,
               count(DISTINCT year)::smallint AS n_years
        FROM stats_season_week WHERE year BETWEEN 2018 AND 2025
        GROUP BY species_key
    )
    SELECT t.species_key, t.total_posts, t.n_years,
           COALESCE(q.n_years_qual, 0),
           q.pk_med, q.pk_iqr,
           CASE WHEN COALESCE(q.n_years_qual, 0) >= 6 THEN q.slope END,
           q.len_med,
           (t.total_posts >= 300 AND COALESCE(q.n_years_qual, 0) >= 6)
    FROM tot t
    LEFT JOIN qual q ON q.species_key = t.species_key
"""

_FOREST_QUANT_SQL = """
    INSERT INTO stats_forest_quant
      (group_kind, group_key, metric, n, p10, p25, p50, p75, p90)
    WITH base AS (
        SELECT dominant_species AS sp,
               meta->>'bonitet'  AS bon,
               -- area_m2 = stored geodesic m^2 (миграция 033); /1e4 -> га
               area_m2 / 1e4      AS area_ha,
               CASE WHEN (meta->>'timber_stock') ~ '^[0-9]+(\\.[0-9]+)?$'
                    THEN (meta->>'timber_stock')::numeric END AS stock
        FROM forest_polygon
        WHERE source = 'rosleshoz'
    ),
    q AS (
        SELECT 'species' AS gk, sp AS g, 'area_ha' AS m, area_ha AS v
        FROM base WHERE sp IS NOT NULL
        UNION ALL
        SELECT 'species', sp, 'stock', stock
        FROM base WHERE sp IS NOT NULL AND stock IS NOT NULL
        UNION ALL
        SELECT 'bonitet', bon, 'stock', stock
        FROM base WHERE bon ~ '^[0-9]+$' AND stock IS NOT NULL
    )
    SELECT gk, g, m, count(*),
           percentile_cont(0.10) WITHIN GROUP (ORDER BY v),
           percentile_cont(0.25) WITHIN GROUP (ORDER BY v),
           percentile_cont(0.50) WITHIN GROUP (ORDER BY v),
           percentile_cont(0.75) WITHIN GROUP (ORDER BY v),
           percentile_cont(0.90) WITHIN GROUP (ORDER BY v)
    FROM q GROUP BY gk, g, m
"""

_FOREST_CROSS_SQL = """
    INSERT INTO stats_forest_cross
      (dim_a, key_a, dim_b, key_b, area_km2, polygon_count)
    WITH base AS (
        SELECT dominant_species AS sp,
               NULLIF(meta->>'bonitet', '') AS bon,
               CASE meta->>'age_group'
                 WHEN 'молодняки' THEN 'молодняки'
                 WHEN 'средневозрастные' THEN 'средневозрастные'
                 WHEN 'приспевающие' THEN 'приспевающие'
                 WHEN 'спелые' THEN 'спелые'
                 WHEN 'перестойные' THEN 'перестойные'
                 ELSE 'не определён' END AS age,
               ST_Area(geometry::geography) / 1e6 AS km2,
               ST_Centroid(geometry) AS c
        FROM forest_polygon
        WHERE source = 'rosleshoz'
    ),
    withd AS (
        SELECT b.sp, b.bon, b.age, b.km2, aa.id AS did
        FROM base b
        LEFT JOIN admin_area aa
          ON aa.level = 6
         AND aa.geometry && b.c
         AND ST_Contains(aa.geometry, b.c)
    )
    SELECT 'species', sp, 'bonitet', bon, SUM(km2), COUNT(*)
    FROM withd WHERE sp IS NOT NULL AND bon IS NOT NULL GROUP BY sp, bon
    UNION ALL
    SELECT 'species', sp, 'age', age, SUM(km2), COUNT(*)
    FROM withd WHERE sp IS NOT NULL GROUP BY sp, age
    UNION ALL
    SELECT 'age', age, 'bonitet', bon, SUM(km2), COUNT(*)
    FROM withd WHERE bon IS NOT NULL GROUP BY age, bon
    UNION ALL
    SELECT 'district', did::text, 'species', sp, SUM(km2), COUNT(*)
    FROM withd WHERE did IS NOT NULL AND sp IS NOT NULL GROUP BY did, sp
    UNION ALL
    SELECT 'district', did::text, 'age', age, SUM(km2), COUNT(*)
    FROM withd WHERE did IS NOT NULL GROUP BY did, age
"""

_FOREST_HIST_SQL = """
    INSERT INTO stats_forest_hist
      (metric, bin_lo, bin_hi, area_km2, polygon_count)
    WITH s AS (
        SELECT CASE WHEN (meta->>'timber_stock') ~ '^[0-9]+(\\.[0-9]+)?$'
                    THEN (meta->>'timber_stock')::numeric END AS stock,
               ST_Area(geometry::geography) / 1e6 AS km2
        FROM forest_polygon
        WHERE source = 'rosleshoz'
    ),
    b AS (
        -- последний бин bk=30 открытый: поглощает весь stock >= 600
        SELECT LEAST(floor(stock / 20.0), 30) AS bk, km2
        FROM s WHERE stock IS NOT NULL
    )
    SELECT 'stock', bk * 20.0, bk * 20.0 + 20.0, SUM(km2), COUNT(*)
    FROM b GROUP BY bk ORDER BY bk
"""

_FOREST_DISTRICT_SQL = """
    INSERT INTO stats_forest_district
      (district_id, district_name, land_km2, forest_km2, forest_pct,
       mean_bonitet, mean_stock, mature_host_pct)
    WITH land AS (
        SELECT id, name_ru AS name,
               ST_Area(geometry::geography) / 1e6 AS land_km2
        FROM admin_area WHERE level = 6
    ),
    fp AS (
        SELECT aa.id AS did,
               ST_Area(p.geometry::geography) / 1e6 AS km2,
               CASE WHEN (p.meta->>'bonitet') ~ '^[0-9]+$'
                    THEN (p.meta->>'bonitet')::numeric END AS bon,
               CASE WHEN (p.meta->>'timber_stock') ~ '^[0-9]+(\\.[0-9]+)?$'
                    THEN (p.meta->>'timber_stock')::numeric END AS stock,
               p.meta->>'age_group' AS age,
               p.dominant_species AS sp
        FROM forest_polygon p
        JOIN admin_area aa
          ON aa.level = 6
         AND aa.geometry && ST_Centroid(p.geometry)
         AND ST_Contains(aa.geometry, ST_Centroid(p.geometry))
        WHERE p.source = 'rosleshoz'
    ),
    agg AS (
        SELECT did,
               SUM(km2) AS forest_km2,
               SUM(km2) FILTER (WHERE bon IS NOT NULL) AS km2_bon,
               SUM(km2 * bon) FILTER (WHERE bon IS NOT NULL) AS bon_w,
               SUM(km2) FILTER (WHERE stock IS NOT NULL) AS km2_stk,
               SUM(km2 * stock) FILTER (WHERE stock IS NOT NULL) AS stk_w,
               -- raw age литералы должны совпадать с age CASE в
               -- _FOREST_CROSS_SQL: fold не трогает mature-бакет, но
               -- синоним/trim там молча разойдётся с этим FILTER
               SUM(km2) FILTER (
                 WHERE age IN ('спелые', 'перестойные')
                   AND sp IN ('pine', 'spruce', 'birch')) AS mature_host
        FROM fp GROUP BY did
    )
    SELECT l.id, l.name,
           ROUND(l.land_km2::numeric, 1),
           ROUND(COALESCE(a.forest_km2, 0)::numeric, 1),
           ROUND((100 * COALESCE(a.forest_km2, 0)
                  / NULLIF(l.land_km2, 0))::numeric, 1),
           ROUND((a.bon_w / NULLIF(a.km2_bon, 0))::numeric, 2),
           ROUND((a.stk_w / NULLIF(a.km2_stk, 0))::numeric, 1),
           ROUND((100 * COALESCE(a.mature_host, 0)
                  / NULLIF(a.forest_km2, 0))::numeric, 1)
    FROM land l LEFT JOIN agg a ON a.did = l.id
"""

SNAPSHOT_STEPS: list[tuple[str, str]] = [
    ("stats_meta", _META_SQL),
    ("stats_forest", _FOREST_SQL),
    ("stats_vk_timeline", _VK_TIMELINE_SQL),
    ("stats_corpus", _CORPUS_SQL),
    ("stats_weather_monthly", _WEATHER_SQL),
    ("stats_weather_clim", _WEATHER_CLIM_SQL),
    ("stats_weather_ym", _WEATHER_YM_SQL),
    ("stats_weather_gdd", _WEATHER_GDD_SQL),
    ("stats_weather_precip_hist", _WEATHER_PRECIP_HIST_SQL),
    ("stats_weather_year", _WEATHER_YEAR_SQL),
    ("stats_weather_district", _WEATHER_DISTRICT_SQL),
    ("stats_weather_district_month", _WEATHER_DISTRICT_MONTH_SQL),
    ("stats_season_week", _SEASON_WEEK_SQL),
    ("stats_season_norm", _SEASON_NORM_SQL),
    ("stats_season_species", _SEASON_SPECIES_SQL),
    ("stats_forest_quant", _FOREST_QUANT_SQL),
    ("stats_forest_cross", _FOREST_CROSS_SQL),
    ("stats_forest_hist", _FOREST_HIST_SQL),
    ("stats_forest_district", _FOREST_DISTRICT_SQL),
]

# forecast.* — собственность сестринского репо, может отсутствовать в
# CI/dev. Шаги, читающие forecast.*, пропускаем если схемы нет.
_FORECAST_GUARDED = {
    "stats_weather_monthly": "forecast.weather_daily",
    "stats_weather_clim": "forecast.weather_daily",
    "stats_weather_ym": "forecast.weather_daily",
    "stats_weather_gdd": "forecast.weather_daily",
    "stats_weather_precip_hist": "forecast.weather_daily",
    "stats_weather_year": "forecast.weather_daily",
    "stats_weather_district": "forecast.weather_daily",
    "stats_weather_district_month": "forecast.weather_daily",
}


def run(conn: psycopg.Connection) -> None:
    for table, sql in SNAPSHOT_STEPS:
        guard = _FORECAST_GUARDED.get(table)
        if guard is not None:
            with conn.cursor() as cur:
                cur.execute("SELECT to_regclass(%s)", (guard,))
                if cur.fetchone()[0] is None:
                    print(f"  -> {table}: SKIP ({guard} absent — sister-repo schema)", flush=True)
                    conn.rollback()
                    continue
        t0 = time.monotonic()
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(f"TRUNCATE {table}")
                cur.execute(sql)
                n = cur.rowcount
        print(f"  -> {table}: {n} rows in {time.monotonic() - t0:.1f}s", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser(description="Rebuild public.stats_* snapshot")
    ap.add_argument("--dsn", default=None)
    args = ap.parse_args()
    dsn = resolve_dsn(args.dsn)
    print(f"DB: {dsn[:55]}...", flush=True)
    with psycopg.connect(dsn) as conn:
        run(conn)
    print("STATS_SNAPSHOT_DONE", flush=True)


if __name__ == "__main__":
    main()
