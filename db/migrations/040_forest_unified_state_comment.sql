-- 040_forest_unified_state_comment.sql
--
-- Update the COMMENT on forest_unified to reflect current state:
-- as of 2026-05, the only populated source is rosleshoz (1.247M rows
-- — full LO coverage). copernicus/terranorte/osm branches still exist
-- in the view definition but match 0 rows, so they're dead code paths
-- per execution but kept for forward compatibility.
--
-- Not rewriting the view: if a second source is ever ingested, the
-- 4-way priority cascade is needed. Cost on the dead branches is
-- negligible (Index Scan on source='copernicus' returns 0 immediately).

COMMENT ON VIEW public.forest_unified IS
    'Unified forest polygons with source-priority cascade '
    '(rosleshoz=60 > copernicus=50 > terranorte=45 > osm=10). '
    'As of 2026-05 only rosleshoz is populated (1.247M rows); the '
    'copernicus/terranorte/osm branches return 0 but stay in the view '
    'for forward compatibility — re-ingesting any of them flips them on '
    'with no schema change. Per-click overhead: ~4 ms exec + ~14 ms '
    'planning. Consumers: services/api/.../forest.py, '
    'services/api/.../stats.py, pipelines/build_forest_tiles.sh.';
