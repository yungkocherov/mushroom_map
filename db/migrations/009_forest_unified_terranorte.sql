-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  forest_unified: добавляем TerraNorte как промежуточный приоритет ║
-- ║                                                                    ║
-- ║  Копернiкус HRL не покрывает Россию (EEA39 only), поэтому для       ║
-- ║  Ленобласти/Карелии мы используем TerraNorte RLC — научный         ║
-- ║  продукт ИКИ РАН, специально построенный для лесов России          ║
-- ║  (230 м, временные ряды MODIS). См. docs/forest_sources_analysis.md.║
-- ║                                                                    ║
-- ║  Каскад приоритетов:                                               ║
-- ║    1. Copernicus (50) — там, где есть (EEA39)                      ║
-- ║    2. TerraNorte (45) — где нет Copernicus (Россия)                ║
-- ║    3. OSM        (10) — где нет ни того, ни другого                ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- Регистрируем TerraNorte как источник
INSERT INTO forest_source (code, display_name, priority, description, url) VALUES
    ('terranorte',
     'TerraNorte RLC (IKI RAS)',
     45,
     'Russia Land Cover, ИКИ РАН (группа Барталёва). MODIS временные ряды, 230 м, классы: тёмнохвойные / светлохвойные / лиственница / широколиственные / мелколиственные.',
     'http://terranorte.iki.rssi.ru/')
ON CONFLICT (code) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    priority     = EXCLUDED.priority,
    description  = EXCLUDED.description,
    url          = EXCLUDED.url;

-- Обновляем view: trivial cascade через NOT EXISTS с GIST-индексом
DROP VIEW IF EXISTS forest_unified CASCADE;

CREATE OR REPLACE VIEW forest_unified AS
WITH cop AS (
    SELECT
        fp.id, fp.region_id, fp.source, fp.geometry, fp.area_m2,
        fp.dominant_species, fp.species_composition,
        fp.canopy_cover, fp.tree_cover_density, fp.confidence,
        50 AS source_priority,
        fp.ingested_at
    FROM forest_polygon fp
    WHERE fp.source = 'copernicus'
),
terranorte_outside_cop AS (
    SELECT
        t.id, t.region_id, t.source, t.geometry, t.area_m2,
        t.dominant_species, t.species_composition,
        t.canopy_cover, t.tree_cover_density, t.confidence,
        45 AS source_priority,
        t.ingested_at
    FROM forest_polygon t
    WHERE t.source = 'terranorte'
      AND NOT EXISTS (
          SELECT 1 FROM forest_polygon c
          WHERE c.source = 'copernicus'
            AND c.geometry && t.geometry
            AND ST_Contains(c.geometry, ST_Centroid(t.geometry))
      )
),
osm_outside_others AS (
    SELECT
        o.id, o.region_id, o.source, o.geometry, o.area_m2,
        o.dominant_species, o.species_composition,
        o.canopy_cover, o.tree_cover_density, o.confidence,
        10 AS source_priority,
        o.ingested_at
    FROM forest_polygon o
    WHERE o.source = 'osm'
      AND NOT EXISTS (
          SELECT 1 FROM forest_polygon better
          WHERE better.source IN ('copernicus', 'terranorte')
            AND better.geometry && o.geometry
            AND ST_Contains(better.geometry, ST_Centroid(o.geometry))
      )
)
SELECT * FROM cop
UNION ALL
SELECT * FROM terranorte_outside_cop
UNION ALL
SELECT * FROM osm_outside_others;

COMMENT ON VIEW forest_unified IS
    'Caскад источников: copernicus(50) > terranorte(45) > osm(10). '
    'Для каждого полигона низкого приоритета проверяется, не покрыт ли '
    'его центроид полигоном высшего приоритета.';

-- Частичный GIST-индекс на TerraNorte для ускорения NOT EXISTS в osm_outside_others
CREATE INDEX IF NOT EXISTS idx_forest_polygon_geom_terranorte
    ON forest_polygon USING GIST (geometry)
    WHERE source = 'terranorte';
