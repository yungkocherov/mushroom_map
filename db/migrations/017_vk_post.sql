-- vk_post — сырые посты из ВК-групп. Промежуточное состояние между
-- VK API и таблицей observation. Позволяет:
--   1. Инкрементальный сбор: `SELECT MAX(date_ts) FROM vk_post WHERE vk_group=?`
--      даёт нижнюю границу для очередного прогона.
--   2. Поэтапная обработка: foray_date → photo_species → observation
--      помечается как сделанная через columns / флаг.
--   3. Безболезненный ре-процессинг: обнулить `photo_processed_at` в
--      конкретном диапазоне дат и перегнать только их.
--   4. Аналитику: «постов/день по группе за 2024» — обычный SQL.
--
-- Поля Stage-1 (collect) заполняются при INSERT из VK API.
-- Stage-2 (dates)  обновляет foray_date, date_source.
-- Stage-3 (photos) обновляет photo_species, photo_processed_at.
-- Stage-4 (promote) ставит observation_written = TRUE после записи в observation.

CREATE TABLE IF NOT EXISTS vk_post (
    id                   BIGSERIAL PRIMARY KEY,
    vk_group             TEXT NOT NULL,                 -- 'grib_spb' / 'gribmo' / ...
    post_id              BIGINT NOT NULL,               -- id внутри ВК
    date_ts              TIMESTAMPTZ NOT NULL,          -- время публикации

    text                 TEXT NOT NULL DEFAULT '',
    likes                INTEGER NOT NULL DEFAULT 0,
    reposts              INTEGER NOT NULL DEFAULT 0,
    views                INTEGER,
    photo_urls           TEXT[] NOT NULL DEFAULT '{}',

    -- Stage 2: извлечение даты похода
    foray_date           DATE,                          -- NULL = не обработано/не найдено
    date_source          TEXT,                          -- 'regex' | 'llm' | 'post_date' | 'not_found' | 'skipped'

    -- Stage 3: распознавание видов по фото (JSON: [{"species": "bolete", "count": 12}, ...])
    photo_species        JSONB,
    photo_processed_at   TIMESTAMPTZ,

    -- Stage 4: запись в observation
    observation_written  BOOLEAN NOT NULL DEFAULT FALSE,

    fetched_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (vk_group, post_id)
);

-- Инкрементальный collect: берём MAX(date_ts) per group → fetch только свежее
CREATE INDEX IF NOT EXISTS idx_vk_post_group_date
    ON vk_post (vk_group, date_ts DESC);

-- Stage 2 cursor: WHERE foray_date IS NULL AND date_source IS NULL
CREATE INDEX IF NOT EXISTS idx_vk_post_needs_dates
    ON vk_post (id) WHERE foray_date IS NULL AND date_source IS NULL;

-- Stage 3 cursor: WHERE photo_processed_at IS NULL AND photo_urls != '{}'
CREATE INDEX IF NOT EXISTS idx_vk_post_needs_photos
    ON vk_post (id) WHERE photo_processed_at IS NULL;

-- Stage 4 cursor: WHERE observation_written = FALSE AND foray_date IS NOT NULL
--                 AND photo_species IS NOT NULL
CREATE INDEX IF NOT EXISTS idx_vk_post_promotable
    ON vk_post (id) WHERE observation_written = FALSE;

COMMENT ON TABLE vk_post IS
    'Сырые посты VK-групп перед записью в observation. Источник истины '
    'для инкрементального обновления и поэтапной обработки.';
