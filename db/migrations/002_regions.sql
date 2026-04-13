-- Регионы (территории, которые обслуживает сервис).
-- Масштабируется: добавление новой территории = INSERT в region + запуск geodata-пайплайна с её bbox.

CREATE TABLE IF NOT EXISTS region (
    id           SERIAL PRIMARY KEY,
    code         TEXT NOT NULL UNIQUE,           -- 'lenoblast', 'moscow_oblast', ...
    name_ru      TEXT NOT NULL,
    name_en      TEXT,
    country_iso  TEXT NOT NULL DEFAULT 'RU',
    geometry     GEOMETRY(MultiPolygon, 4326) NOT NULL,
    bbox         GEOMETRY(Polygon, 4326) NOT NULL,
    timezone     TEXT NOT NULL,
    -- какая ВК-группа (если есть) питает эмпирические данные для этого региона
    primary_vk_group TEXT,
    -- свободные метаданные: ресолюшн H3, приоритет источника лесов и т.д.
    meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_region_geometry ON region USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_region_bbox     ON region USING GIST (bbox);
CREATE INDEX IF NOT EXISTS idx_region_code     ON region (code);

-- Административные подразделения внутри региона (районы, округа).
-- Используются как fallback привязки наблюдений, когда точная геометрия неизвестна.
CREATE TABLE IF NOT EXISTS admin_area (
    id           SERIAL PRIMARY KEY,
    region_id    INTEGER NOT NULL REFERENCES region(id) ON DELETE CASCADE,
    code         TEXT NOT NULL,                   -- OSM boundary id или собственный
    level        INTEGER NOT NULL,                -- 4=регион, 6=район, 8=поселение
    name_ru      TEXT NOT NULL,
    name_en      TEXT,
    geometry     GEOMETRY(MultiPolygon, 4326) NOT NULL,
    meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (region_id, code)
);

CREATE INDEX IF NOT EXISTS idx_admin_area_geometry ON admin_area USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_admin_area_region   ON admin_area (region_id, level);
CREATE INDEX IF NOT EXISTS idx_admin_area_name_trgm ON admin_area USING GIN (name_ru gin_trgm_ops);
