-- 034_drop_unused_indexes.sql
--
-- Drop indexes with idx_scan=0 over the lifetime of the DB
-- (pg_stat_database.stats_reset is NULL, so counters are accurate).
-- Frees ~63 MB of disk + write overhead on UPDATE.
--
-- Each DROP is documented with why it's safe.
-- If a future query needs one of these, recreate it deliberately.
--
-- NOT dropped here: idx_vk_post_promotable (waits for migration 035
-- which also drops the dead observation_written column).

-- forest_polygon: 37 MB. btree on dominant_species. Filtering by
-- species happens client-side in MapLibre style expressions
-- (forestStyle.ts), never in SQL. 0 lifetime scans.
DROP INDEX IF EXISTS public.idx_forest_polygon_dominant;

-- vk_post: 5.5 MB. btree(vk_group, date_ts DESC). Pipelines that need
-- "latest post per group" use ORDER BY ... LIMIT N which the pkey
-- already supports via reverse-scan. 0 lifetime scans.
DROP INDEX IF EXISTS public.idx_vk_post_group_date;

-- vk_post: 3.0 MB. partial WHERE photo_processed_at IS NULL. Photos
-- backfill is complete (69262/69262 classified). If we rerun
-- classification later, recreate as needed.
DROP INDEX IF EXISTS public.idx_vk_post_needs_photos;

-- vk_post: 1.5 MB each. partials for cursor "needs date / needs place"
-- — same story, backfills done. Recreate if reprocessing batch.
DROP INDEX IF EXISTS public.idx_vk_post_needs_dates;
DROP INDEX IF EXISTS public.idx_vk_post_needs_place;

-- vk_post: 2.5 MB. btree on photo_prompt_version. Only 1 lifetime
-- scan. We pivot prompt versions rarely; on bump we'd recreate.
DROP INDEX IF EXISTS public.idx_vk_post_prompt_version;

-- gazetteer_entry: 5.5 MB. GIN on name_normalized gin_trgm_ops.
-- Place-search query (services/api/.../places.py) is structured as
-- `name_ru ILIKE '%q%' OR aliases::text ILIKE '%q%' OR
-- name_normalized ILIKE '%q%'` — planner picks seq-scan on 23k rows
-- (39 ms total) over multi-arm OR with one indexable predicate.
-- Trigram index has 0 lifetime scans. Drop. If we ever single out
-- name_normalized in the WHERE arm and seq-scan becomes painful,
-- recreate.
DROP INDEX IF EXISTS public.idx_gazetteer_name_trgm;

-- gazetteer_entry: 1.0 MB. GIN on aliases (anyarray). The query uses
-- `aliases::text ILIKE` (text-stringifies the array), which cannot
-- use a GIN-array index. The exact-membership form
-- `q = ANY(aliases)` exists only in the SELECT scoring expression,
-- not in WHERE — so the index is unreachable. Drop.
DROP INDEX IF EXISTS public.idx_gazetteer_aliases;

-- osm_waterway: 4.2 MB. btree on type. Tile builds and API distance
-- queries don't filter by type. 0 lifetime scans.
DROP INDEX IF EXISTS public.osm_waterway_type_idx;

-- weather_daily (forecast): 2.0 MB. btree(district_id, date DESC) —
-- redundant with pkey UNIQUE (district_id, date). PG btree handles
-- ORDER BY ... DESC via reverse scan, so a separate DESC index
-- contributes nothing. 0 lifetime scans.
DROP INDEX IF EXISTS forecast.idx_weather_daily_district_date_desc;

-- prediction (forecast): 0.5 MB. btree(date, group_key). Lookup
-- pattern is (district_id, date, group_key, model_version) which is
-- covered by pkey. 0 lifetime scans.
DROP INDEX IF EXISTS forecast.idx_prediction_date_group;

-- wetland: 0.9 MB. btree on type. No type-filtered queries.
DROP INDEX IF EXISTS public.idx_wetland_type;

-- soil_polygon: btree on geom (small) — gist already exists separately.
-- The btree variant is meaningless for spatial.
DROP INDEX IF EXISTS public.idx_soil_polygon_geom;

-- felling_area: 0 lifetime scans on type btree. Tile builds use seq
-- on small (1.27k rows) data.
DROP INDEX IF EXISTS public.idx_felling_type;
