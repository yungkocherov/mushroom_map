-- Вырубки, гари и другие special-condition-area из ФГИС ЛК.
--
-- Для грибника вырубки 3-7 лет — отдельная экология:
--   - подосиновики, маслята, опята массово на гарях и свежих вырубках
--   - строчки и сморчки весной на 1-2-летних вырубках
--
-- Источник: слой SPECIAL_CONDITION_AREA в ФГИС ЛК MVT. Не включает
-- water-zone типы, которые уже в water_zone таблице.

CREATE TABLE IF NOT EXISTS felling_area (
    id          BIGSERIAL PRIMARY KEY,
    region_id   INTEGER REFERENCES region(id) ON DELETE CASCADE,
    externalid  TEXT NOT NULL,
    area_type   TEXT NOT NULL,   -- 'Вырубка' | 'Гарь' | 'Погибшее насаждение' | ...
    layer_name  TEXT NOT NULL,   -- исходный MVT-слой
    geometry    GEOMETRY(MultiPolygon, 4326) NOT NULL,
    area_m2     DOUBLE PRECISION,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (externalid)
);

CREATE INDEX IF NOT EXISTS idx_felling_geometry ON felling_area USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_felling_region   ON felling_area (region_id);
CREATE INDEX IF NOT EXISTS idx_felling_type     ON felling_area (area_type);

COMMENT ON TABLE felling_area IS
    'SPECIAL_CONDITION_AREA из ФГИС ЛК: вырубки, гари, погибшие насаждения. '
    'Отдельная экология по сравнению со взрослым лесом — подосиновики/маслята '
    'на свежих вырубках и гарях.';
