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
    INSERT INTO stats_weather_monthly (year, month, temp_mean, precip_sum, soil_moist_mean)
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
               AVG(p)  AS precip_sum,
               AVG(sm) AS soil_moist_mean
        FROM src
        GROUP BY y, m
    ),
    climatology AS (
        SELECT 0 AS y, m,
               AVG(temp_mean)       AS temp_mean,
               AVG(precip_sum)      AS precip_sum,
               AVG(soil_moist_mean) AS soil_moist_mean
        FROM per_year
        GROUP BY m
    )
    SELECT y, m, temp_mean, precip_sum, soil_moist_mean FROM per_year
    UNION ALL
    SELECT y, m, temp_mean, precip_sum, soil_moist_mean FROM climatology
"""

SNAPSHOT_STEPS: list[tuple[str, str]] = [
    ("stats_meta", _META_SQL),
    ("stats_forest", _FOREST_SQL),
    ("stats_vk_timeline", _VK_TIMELINE_SQL),
    ("stats_corpus", _CORPUS_SQL),
    ("stats_weather_monthly", _WEATHER_SQL),
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
