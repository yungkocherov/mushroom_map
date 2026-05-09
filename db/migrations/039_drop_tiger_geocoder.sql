-- 039_drop_tiger_geocoder.sql
--
-- postgis_tiger_geocoder + fuzzystrmatch came in via the postgis docker
-- bundle, not by our 001_extensions.sql. Tiger is a US-address geocoder
-- (Census Bureau) — irrelevant for a Russia-only project. Cleans up:
--   - 3.6 MB across schemas tiger / tiger_data
--   - ~30 always-empty tables polluting pg_stat_user_indexes audits
--   - fuzzystrmatch (only used by tiger; we don't soundex/levenshtein
--     anywhere else — verified by grep over services/ pipelines/ apps/).
--
-- postgis_topology stays — declared explicitly in 001_extensions.sql.
-- Even though we don't use it today, it's user-intentional and might
-- be wanted for forest topology work.

DROP EXTENSION IF EXISTS postgis_tiger_geocoder CASCADE;
DROP EXTENSION IF EXISTS fuzzystrmatch CASCADE;

-- The tiger / tiger_data schemas should be gone after CASCADE; if any
-- empty stub remains, drop it.
DROP SCHEMA IF EXISTS tiger_data CASCADE;
DROP SCHEMA IF EXISTS tiger CASCADE;
