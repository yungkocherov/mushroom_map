-- 038_drop_observation_written.sql
--
-- vk_post.observation_written and its partial index idx_vk_post_promotable
-- belong to Stage-4 «promote VK-post → observation row» which never
-- shipped (see CLAUDE.md «Deprecated» section). All 69262/69262 rows
-- have observation_written=FALSE and the partial index covers them all
-- (it's effectively full-table) — 3.2 MB of waste with 0 lifetime scans.
--
-- The observation table itself is kept (per CLAUDE.md: it might be
-- repurposed for POI-level data later). What we remove here is the
-- per-vk-post bookkeeping that Stage-4 owned.
--
-- No code references observation_written outside this migration and
-- the original 017_vk_post.sql comment.

DROP INDEX IF EXISTS public.idx_vk_post_promotable;
ALTER TABLE public.vk_post DROP COLUMN IF EXISTS observation_written;
