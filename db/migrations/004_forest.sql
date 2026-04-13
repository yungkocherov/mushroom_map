-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Лесные полигоны — нормализованное хранилище, независимое         ║
-- ║  от источника данных (OSM, Copernicus, Рослесхоз...).              ║
-- ║                                                                    ║
-- ║  КЛЮЧЕВАЯ ИДЕЯ: все источники пишут в одну таблицу с колонкой     ║
-- ║  `source`. Фронт и API читают через view `forest_unified`,        ║
-- ║  который приоритезирует наиболее надёжный источник на ячейку.     ║
-- ║                                                                    ║
-- ║  Переход OSM → Copernicus = добавить строки с source='copernicus' ║
-- ║  и обновить приоритеты. API-контракт не меняется. Подробнее:      ║
-- ║  docs/copernicus_migration.md                                      ║
-- ╚══════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS forest_source (
    code         TEXT PRIMARY KEY,                 -- 'osm' | 'copernicus' | 'rosleshoz'
    display_name TEXT NOT NULL,
    priority     INTEGER NOT NULL,                 -- чем выше, тем главнее источник
    description  TEXT,
    url          TEXT
);

INSERT INTO forest_source (code, display_name, priority, description, url) VALUES
    ('osm',        'OpenStreetMap',               10, 'Народная карта, теги landuse=forest и leaf_type', 'https://www.openstreetmap.org'),
    ('copernicus', 'Copernicus HRL Tree Species', 50, 'Спутниковые данные Европейской комиссии, 10 м',   'https://land.copernicus.eu/pan-european/high-resolution-layers/forests'),
    ('rosleshoz',  'Рослесхоз (ВЛС)',             40, 'Публичная лесная карта России', 'https://lk.rosleshoz.gov.ru/')
ON CONFLICT (code) DO NOTHING;

-- ────────────────────────────────────────────────────────────────
-- Основная таблица лесных полигонов.
-- Одна строка = один полигон от одного источника.
-- Пересечения разных источников допускаются — view решит, что показать.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS forest_polygon (
    id                  BIGSERIAL PRIMARY KEY,
    region_id           INTEGER REFERENCES region(id) ON DELETE CASCADE,
    source              TEXT NOT NULL REFERENCES forest_source(code),
    source_feature_id   TEXT,                     -- id в исходнике: OSM way/relation id, Copernicus tile, ...
    source_version      TEXT NOT NULL,            -- 'osm-2026-04-13', 'copernicus-tree-species-2018-v1'

    geometry            GEOMETRY(MultiPolygon, 4326) NOT NULL,
    area_m2             DOUBLE PRECISION,          -- кэш для фильтров (исключаем совсем мелкие лоскуты)

    -- Доминирующая порода. Стабильный slug — синхронизирован со species_forest_affinity.forest_type
    dominant_species    TEXT NOT NULL,             -- 'pine'|'spruce'|'birch'|'aspen'|'oak'|'mixed_coniferous'|'mixed_broadleaved'|'mixed'|'unknown'

    -- Точная породная смесь (доли 0..1). NULL для OSM (нет данных), заполняется Copernicus'ом.
    species_composition JSONB,                    -- {"pine":0.6,"spruce":0.3,"birch":0.1}

    -- Характеристики полога — для будущих источников (Copernicus HRL Forest)
    canopy_cover        REAL,                      -- 0..1
    tree_cover_density  REAL,                      -- 0..1

    -- Надёжность. Для грубых OSM-леса ~0.5, для Copernicus ~0.9.
    confidence          REAL NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),

    meta                JSONB NOT NULL DEFAULT '{}'::jsonb,
    ingested_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (source, source_feature_id, source_version)
);

CREATE INDEX IF NOT EXISTS idx_forest_polygon_geometry ON forest_polygon USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_forest_polygon_region   ON forest_polygon (region_id);
CREATE INDEX IF NOT EXISTS idx_forest_polygon_source   ON forest_polygon (source);
CREATE INDEX IF NOT EXISTS idx_forest_polygon_dominant ON forest_polygon (dominant_species);

-- ────────────────────────────────────────────────────────────────
-- VIEW: унифицированное представление.
-- Выбирает самый приоритетный источник на каждую ячейку.
-- Пока OSM единственный — возвращает его же. Когда появится Copernicus —
-- переопределится на LATERAL JOIN с приоритезацией.
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW forest_unified AS
SELECT DISTINCT ON (fp.id)
    fp.id,
    fp.region_id,
    fp.source,
    fp.geometry,
    fp.area_m2,
    fp.dominant_species,
    fp.species_composition,
    fp.canopy_cover,
    fp.tree_cover_density,
    fp.confidence,
    fs.priority AS source_priority,
    fp.ingested_at
FROM forest_polygon fp
JOIN forest_source fs ON fs.code = fp.source
ORDER BY fp.id, fs.priority DESC;

-- NB: на этапе перехода на Copernicus заменим VIEW на полноценную
-- приоритезацию по ST_Intersects (см. docs/copernicus_migration.md §4).

COMMENT ON TABLE forest_polygon IS
    'Нормализованное хранилище лесных полигонов. Несколько источников могут сосуществовать; view forest_unified выбирает приоритетный.';
COMMENT ON COLUMN forest_polygon.dominant_species IS
    'Slug породы. Синхронизирован со species_forest_affinity.forest_type для связи с грибами.';
