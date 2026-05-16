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
               count(DISTINCT year) AS n_years
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

SNAPSHOT_STEPS: list[tuple[str, str]] = [
    ("stats_meta", _META_SQL),
    ("stats_forest", _FOREST_SQL),
    ("stats_vk_timeline", _VK_TIMELINE_SQL),
    ("stats_corpus", _CORPUS_SQL),
    ("stats_weather_monthly", _WEATHER_SQL),
    ("stats_season_week", _SEASON_WEEK_SQL),
    ("stats_season_norm", _SEASON_NORM_SQL),
    ("stats_season_species", _SEASON_SPECIES_SQL),
]

# forecast.* — собственность сестринского репо, может отсутствовать в
# CI/dev. Шаги, читающие forecast.*, пропускаем если схемы нет.
_FORECAST_GUARDED = {"stats_weather_monthly": "forecast.weather_daily"}


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
