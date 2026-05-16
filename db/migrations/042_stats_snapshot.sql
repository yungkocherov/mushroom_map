-- 2026-05-16: stats snapshot tables (раздел «Статистика», Phase 1).
--
-- Все агрегаты раздела считаются заранее пайплайном
-- pipelines/build_stats_snapshot.py и складываются сюда. API читает
-- только эти таблицы — никаких heavy-scan по 2.17M полигонов на
-- запрос (free-tier discipline, см. spec
-- docs/superpowers/specs/2026-05-16-stats-section-design.md).
--
-- Идемпотентность: пайплайн делает TRUNCATE + INSERT в одной
-- транзакции на таблицу. Все таблицы пересоздаются целиком каждый
-- прогон, исторических версий не храним.
--
-- Phase 1 покрывает public.* only. forecast.* (погода) и
-- profile-таблицы (stats_district_profile / stats_species_profile /
-- stats_species_season) добавит следующая миграция в своих фазах.

CREATE TABLE IF NOT EXISTS stats_meta (
    -- single-row: пайплайн делает TRUNCATE + один INSERT
    key                    TEXT PRIMARY KEY,
    generated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    forest_source_version  TEXT,
    vk_prompt_version      TEXT
);

CREATE TABLE IF NOT EXISTS stats_forest (
    -- состав леса ЛО (вся область). dimension: species | bonitet
    -- | age_group | source. key = сырое значение (slug / число /
    -- группа), label = пока = key (человеко-читаемые подписи
    -- мапятся на фронте в Phase 2).
    dimension      TEXT NOT NULL,
    bucket_key     TEXT NOT NULL,
    label          TEXT NOT NULL,
    area_km2       DOUBLE PRECISION NOT NULL DEFAULT 0,
    polygon_count  BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (dimension, bucket_key)
);

CREATE TABLE IF NOT EXISTS stats_vk_timeline (
    -- недельная активность ВК по группам видов (сырые ключи
    -- photo_species, без forecast.group). bucket = понедельник недели.
    bucket       DATE NOT NULL,
    group_key    TEXT NOT NULL,
    post_count   BIGINT NOT NULL DEFAULT 0,
    find_count   BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket, group_key)
);

CREATE INDEX IF NOT EXISTS idx_stats_vk_timeline_group
    ON stats_vk_timeline (group_key, bucket);

CREATE TABLE IF NOT EXISTS stats_corpus (
    -- гибкий key/value для здоровья пайплайна + распределения
    -- AI-классификации (в detail JSONB).
    metric      TEXT PRIMARY KEY,
    value_num   DOUBLE PRECISION,
    value_text  TEXT,
    detail      JSONB NOT NULL DEFAULT '{}'::jsonb
);
