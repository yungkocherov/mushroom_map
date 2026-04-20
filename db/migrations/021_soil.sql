-- Почвы РФ масштаба 1:2.5М (Докучаевский институт, EGRPR / soil-db.ru).
--
-- Для грибника тип почвы — сильный предиктор:
--   - Дерново-карбонатные (Дк): белые на кальции, груздь
--   - Подзолы (П, Пд, Пг): лисички, моховики, подберёзовики
--   - Болотные (Б, Тб): клюква, морошка, подболотники
-- Для prediction-модели в sister repo — категориальный признак (Zone).
--
-- Источник: shapefile soil_map_M2_5-1.0 + 4 xls (атрибуты, легенды, разрезы).
-- Лицензия: открытые данные госоргана; explicit лицензия не указана.
-- Масштаб: 1:2 500 000 (грубый для ЛО, но 295 типов почв в легенде —
-- достаточно для категориального признака).

-- Справочник типов почв (295 строк): SOIL_ID -> Symbol/Descript/Zone.
CREATE TABLE IF NOT EXISTS soil_type (
    soil_id     INTEGER PRIMARY KEY,
    symbol      TEXT,         -- 'Дк', 'Пд', 'Тб'
    descript    TEXT NOT NULL,-- 'Дерново-карбонатные (включая выщелоченные...)'
    zone        TEXT          -- одна из 27 групповых категорий ('Подзолистые', 'Гидроморфные...')
);

-- Справочник почвообразующих пород (31 строка): PARENT_ID -> Name.
CREATE TABLE IF NOT EXISTS soil_parent (
    parent_id   INTEGER PRIMARY KEY,
    name        TEXT NOT NULL -- 'Песчаные и супесчаные', 'Суглинистые карбонатные', ...
);

-- Полигоны почв (~25k для всей РФ, в bbox ЛО — десятки).
-- soil0 — основная почва, soil1/2/3 — сопутствующие в комплексе.
CREATE TABLE IF NOT EXISTS soil_polygon (
    id          BIGSERIAL PRIMARY KEY,
    region_id   INTEGER REFERENCES region(id) ON DELETE CASCADE,
    poligon_id  INTEGER NOT NULL,                      -- из источника
    soil0_id    INTEGER REFERENCES soil_type(soil_id),
    soil1_id    INTEGER REFERENCES soil_type(soil_id),
    soil2_id    INTEGER REFERENCES soil_type(soil_id),
    soil3_id    INTEGER REFERENCES soil_type(soil_id),
    parent1_id  INTEGER REFERENCES soil_parent(parent_id),
    parent2_id  INTEGER REFERENCES soil_parent(parent_id),
    geometry    GEOMETRY(MultiPolygon, 4326) NOT NULL,
    area_m2     DOUBLE PRECISION,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (poligon_id)
);

CREATE INDEX IF NOT EXISTS idx_soil_polygon_geom    ON soil_polygon USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_soil_polygon_region  ON soil_polygon (region_id);
CREATE INDEX IF NOT EXISTS idx_soil_polygon_soil0   ON soil_polygon (soil0_id);

-- Точечные почвенные разрезы (soil_data.xls). Один CardID может иметь несколько
-- горизонтов — храним отдельной строкой каждый, для модели достаточно агрегата
-- по верхнему горизонту (HORTOP=0). Только в bbox ЛО+Карелия.
CREATE TABLE IF NOT EXISTS soil_profile (
    id          BIGSERIAL PRIMARY KEY,
    card_id     INTEGER NOT NULL,
    soil_id     INTEGER REFERENCES soil_type(soil_id),
    rusm        TEXT,             -- русское описание почвы
    wrb06       TEXT,             -- международная классификация
    rureg       TEXT,             -- регион ('Ленинградская область')
    location    TEXT,
    landuse     TEXT,             -- 'лес, вырубка', и т.п.
    veg_assoc   TEXT,             -- ассоциация растительности (для грибов!)
    geom        GEOMETRY(Point, 4326) NOT NULL,
    altitude_m  DOUBLE PRECISION,
    -- агрегаты по верхнему горизонту
    ph_h2o      DOUBLE PRECISION,
    ph_salt     DOUBLE PRECISION,
    corg        DOUBLE PRECISION, -- % углерод органический
    horizons    JSONB,            -- полный список горизонтов: [{top,bot,name,ph,corg}, ...]
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (card_id)
);

CREATE INDEX IF NOT EXISTS idx_soil_profile_geom  ON soil_profile USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_soil_profile_soil  ON soil_profile (soil_id);

COMMENT ON TABLE soil_polygon IS
    'Почвенная карта РФ 1:2.5М (Докучаевский ин-т / EGRPR). soil0 = основная '
    'почва, soil1/2/3 = сопутствующие в почвенном комплексе. Используется как '
    'категориальный признак для модели прогноза грибов.';

COMMENT ON TABLE soil_profile IS
    'Точечные почвенные разрезы из soil_data.xls. Только в bbox ЛО+Карелия '
    '(всего по РФ ~860 точек). Каждый горизонт = отдельная строка через '
    'horizons JSONB; верхний (0-N см) дублируется в ph_h2o/corg для быстрого '
    'JOIN. Для модели — nearest-neighbour признак.';
