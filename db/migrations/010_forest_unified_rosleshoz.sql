-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  forest_unified: добавляем Rosleshoz наверх каскада (приоритет 60) ║
-- ║                                                                    ║
-- ║  Rosleshoz / ФГИС ЛК — официальные таксационные описания выделов   ║
-- ║  с реальным породным составом («6Е3С1Б» → spruce 0.6, pine 0.3,    ║
-- ║  birch 0.1). Это лучшая точность, которая у нас есть.              ║
-- ║                                                                    ║
-- ║  Итоговый каскад:                                                  ║
-- ║    1. Rosleshoz (60) — реальные породные формулы из кадастра       ║
-- ║    2. Copernicus (50) — спутниковая классификация (EEA39 only)     ║
-- ║    3. TerraNorte (45) — научный продукт для России, 230 м          ║
-- ║    4. OSM        (10) — базовый слой «где вообще есть лес»         ║
-- ║                                                                    ║
-- ║  Для каждого полигона нижнего приоритета проверяется, не покрыт    ║
-- ║  ли его центроид полигоном высшего приоритета — см. 008 и 009.     ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- Регистрируем Rosleshoz как источник
INSERT INTO forest_source (code, display_name, priority, description, url) VALUES
    ('rosleshoz',
     'Rosleshoz / ФГИС ЛК',
     60,
     'Таксационные описания выделов, Федеральное агентство лесного хозяйства. Формула породного состава → реальные проценты видов.',
     'https://lk.rosleshoz.gov.ru/')
ON CONFLICT (code) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    priority     = EXCLUDED.priority,
    description  = EXCLUDED.description,
    url          = EXCLUDED.url;

-- Переписываем view с полным каскадом
DROP VIEW IF EXISTS forest_unified CASCADE;

CREATE OR REPLACE VIEW forest_unified AS
WITH rosleshoz AS (
    SELECT
        fp.id, fp.region_id, fp.source, fp.geometry, fp.area_m2,
        fp.dominant_species, fp.species_composition,
        fp.canopy_cover, fp.tree_cover_density, fp.confidence,
        60 AS source_priority,
        fp.ingested_at
    FROM forest_polygon fp
    WHERE fp.source = 'rosleshoz'
),
cop_outside_rl AS (
    SELECT
        c.id, c.region_id, c.source, c.geometry, c.area_m2,
        c.dominant_species, c.species_composition,
        c.canopy_cover, c.tree_cover_density, c.confidence,
        50 AS source_priority,
        c.ingested_at
    FROM forest_polygon c
    WHERE c.source = 'copernicus'
      AND NOT EXISTS (
          SELECT 1 FROM forest_polygon r
          WHERE r.source = 'rosleshoz'
            AND r.geometry && c.geometry
            AND ST_Contains(r.geometry, ST_Centroid(c.geometry))
      )
),
terranorte_outside_better AS (
    SELECT
        t.id, t.region_id, t.source, t.geometry, t.area_m2,
        t.dominant_species, t.species_composition,
        t.canopy_cover, t.tree_cover_density, t.confidence,
        45 AS source_priority,
        t.ingested_at
    FROM forest_polygon t
    WHERE t.source = 'terranorte'
      AND NOT EXISTS (
          SELECT 1 FROM forest_polygon b
          WHERE b.source IN ('rosleshoz', 'copernicus')
            AND b.geometry && t.geometry
            AND ST_Contains(b.geometry, ST_Centroid(t.geometry))
      )
),
osm_outside_all AS (
    SELECT
        o.id, o.region_id, o.source, o.geometry, o.area_m2,
        o.dominant_species, o.species_composition,
        o.canopy_cover, o.tree_cover_density, o.confidence,
        10 AS source_priority,
        o.ingested_at
    FROM forest_polygon o
    WHERE o.source = 'osm'
      AND NOT EXISTS (
          SELECT 1 FROM forest_polygon b
          WHERE b.source IN ('rosleshoz', 'copernicus', 'terranorte')
            AND b.geometry && o.geometry
            AND ST_Contains(b.geometry, ST_Centroid(o.geometry))
      )
)
SELECT * FROM rosleshoz
UNION ALL
SELECT * FROM cop_outside_rl
UNION ALL
SELECT * FROM terranorte_outside_better
UNION ALL
SELECT * FROM osm_outside_all;

COMMENT ON VIEW forest_unified IS
    'Cascade: rosleshoz(60) > copernicus(50) > terranorte(45) > osm(10). '
    'Для полигона низкого приоритета проверяется, не покрыт ли его центроид '
    'полигоном высшего приоритета.';

-- Частичный GIST-индекс на rosleshoz-полигоны для ускорения NOT EXISTS
CREATE INDEX IF NOT EXISTS idx_forest_polygon_geom_rosleshoz
    ON forest_polygon USING GIST (geometry)
    WHERE source = 'rosleshoz';
