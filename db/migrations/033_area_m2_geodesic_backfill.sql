-- 033_area_m2_geodesic_backfill.sql
--
-- Fix area_m2 in 5 tables: was stored as planar Web Mercator m^2
-- (ST_Area(ST_Transform(geom, 3857))) which inflates by 1/cos^2(lat) ~ 4x
-- at 60 deg N (Leningrad oblast). Single exception: water_zone used
-- geom.area * 111320^2 with no cos-correction -> ~2x inflation.
--
-- Symptom in production: forest popup showed ~4x area in hectares.
--
-- Fix: backfill all area_m2 via ST_Area(geometry::geography), which is
-- WGS84 geodesic m^2. Ingest scripts (ingest_forest/felling/wetlands/
-- protective/water_zones) and services/geodata/src/geodata/db.py are
-- updated in this same commit to use the geography path going forward.
--
-- Tables: forest_polygon (1.24M), wetland (94k), felling_area (1.27k),
-- protective_forest (598), water_zone (152). Total ~1.34M UPDATE rows.
-- Largest hit: forest_polygon — expect ~3-5 min on dev.

BEGIN;

-- forest_polygon: 1.247M rows. Use a single batch — geography ST_Area
-- is fast on indexed multipolygons.
UPDATE forest_polygon
   SET area_m2 = ST_Area(geometry::geography);

UPDATE wetland
   SET area_m2 = ST_Area(geometry::geography);

UPDATE felling_area
   SET area_m2 = ST_Area(geometry::geography);

UPDATE protective_forest
   SET area_m2 = ST_Area(geometry::geography);

UPDATE water_zone
   SET area_m2 = ST_Area(geometry::geography);

-- Defensive comment on each column so future ingest authors don't
-- reintroduce ST_Transform(..., 3857).
COMMENT ON COLUMN forest_polygon.area_m2    IS 'Geodesic area in m^2 via ST_Area(geometry::geography). Do NOT use ST_Transform(...,3857) — Web Mercator inflates ~4x at 60N.';
COMMENT ON COLUMN wetland.area_m2           IS 'Geodesic area in m^2 via ST_Area(geometry::geography).';
COMMENT ON COLUMN felling_area.area_m2      IS 'Geodesic area in m^2 via ST_Area(geometry::geography).';
COMMENT ON COLUMN protective_forest.area_m2 IS 'Geodesic area in m^2 via ST_Area(geometry::geography).';
COMMENT ON COLUMN water_zone.area_m2        IS 'Geodesic area in m^2 via ST_Area(geometry::geography).';

COMMIT;

-- Post-migration: pmtiles for forest/wetland/felling/protective/water
-- ship area_m2 as a feature property. The new values will appear in
-- popups only after PMTiles are rebuilt. Run on dev:
--   bash pipelines/build_forest_tiles.sh
--   .venv/Scripts/python.exe -u pipelines/build_wetlands_tiles.py
--   .venv/Scripts/python.exe -u pipelines/build_felling_tiles.py
--   .venv/Scripts/python.exe -u pipelines/build_protective_tiles.py
--   .venv/Scripts/python.exe -u pipelines/build_water_tiles.py
-- then bash scripts/deploy/sync_tiles_to_vm.sh
