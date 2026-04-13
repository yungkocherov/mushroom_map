-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  forest_unified: умная приоритезация источников                    ║
-- ║                                                                    ║
-- ║  Стратегия:                                                        ║
-- ║    1. Copernicus-полигоны используются там, где они есть           ║
-- ║       (в их геометрии).                                            ║
-- ║    2. OSM-полигоны показываются только в областях, НЕ покрытых     ║
-- ║       Copernicus'ом. Формально — OSM-полигон включается, если      ║
-- ║       его центроид не лежит внутри ни одного Copernicus-полигона.  ║
-- ║    3. Rosleshoz (если появится) вставляется по тому же принципу    ║
-- ║       между ними.                                                  ║
-- ║                                                                    ║
-- ║  Почему "центроид не внутри" а не ST_Difference:                   ║
-- ║    ST_Difference строит новые геометрии и очень дорог.             ║
-- ║    "центроид не внутри" работает как булев фильтр и масштабируется ║
-- ║    линейно при наличии GIST-индекса на forest_polygon.geometry.    ║
-- ║                                                                    ║
-- ║  Мат.вью сделан, чтобы уметь быстро отдавать тайлы. REFRESH после  ║
-- ║  каждого ingest_forest: вызывается pipeline'ом ingest_copernicus.  ║
-- ╚══════════════════════════════════════════════════════════════════╝

DROP VIEW IF EXISTS forest_unified CASCADE;

CREATE OR REPLACE VIEW forest_unified AS
WITH cop AS (
    SELECT
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
        50 AS source_priority,
        fp.ingested_at
    FROM forest_polygon fp
    WHERE fp.source = 'copernicus'
),
osm_outside_cop AS (
    SELECT
        o.id,
        o.region_id,
        o.source,
        o.geometry,
        o.area_m2,
        o.dominant_species,
        o.species_composition,
        o.canopy_cover,
        o.tree_cover_density,
        o.confidence,
        10 AS source_priority,
        o.ingested_at
    FROM forest_polygon o
    WHERE o.source = 'osm'
      AND NOT EXISTS (
          SELECT 1 FROM forest_polygon c
          WHERE c.source = 'copernicus'
            AND c.geometry && o.geometry
            AND ST_Contains(c.geometry, ST_Centroid(o.geometry))
      )
)
SELECT * FROM cop
UNION ALL
SELECT * FROM osm_outside_cop;

COMMENT ON VIEW forest_unified IS
    'Copernicus где есть, OSM-дополнение там, где центроид OSM-полигона не внутри Copernicus. '
    'Обновляется автоматически — это view, а не матвью.';

-- Вспомогательный индекс для ST_Contains + && (ускоряет NOT EXISTS).
-- idx_forest_polygon_geometry уже существует (миграция 004), но частичный
-- индекс только на Copernicus делает фильтр осмо-полигонов быстрее.
CREATE INDEX IF NOT EXISTS idx_forest_polygon_geom_cop
    ON forest_polygon USING GIST (geometry)
    WHERE source = 'copernicus';
