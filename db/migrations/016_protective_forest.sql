-- Защитные леса из ФГИС ЛК (PROTECTIVE_FOREST layer).
--
-- Категории: защитные полосы вдоль путей, запретные полосы, лесопарковые
-- зоны, зелёные зоны, городские леса. Сбор грибов в них либо ограничен,
-- либо полностью запрещён — важно видеть до похода.
--
-- Нерестоохранные полосы уже в water_zone — здесь их нет.

CREATE TABLE IF NOT EXISTS protective_forest (
    id           BIGSERIAL PRIMARY KEY,
    region_id    INTEGER REFERENCES region(id) ON DELETE CASCADE,
    externalid   TEXT NOT NULL,
    protect_type TEXT NOT NULL,  -- 'Защитная полоса лесов ...' | 'Городские леса' | ...
    layer_name   TEXT NOT NULL,
    geometry     GEOMETRY(MultiPolygon, 4326) NOT NULL,
    area_m2      DOUBLE PRECISION,
    ingested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (externalid)
);

CREATE INDEX IF NOT EXISTS idx_protective_geometry ON protective_forest USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_protective_region   ON protective_forest (region_id);
CREATE INDEX IF NOT EXISTS idx_protective_type     ON protective_forest (protect_type);

COMMENT ON TABLE protective_forest IS
    'PROTECTIVE_FOREST из ФГИС ЛК: защитные/запретные/лесопарковые/городские '
    'леса. Сбор грибов ограничен или запрещён — pure юридический слой '
    'для информирования грибника ДО похода.';
