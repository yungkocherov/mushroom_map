-- 037_fk_supporting_indexes.sql
--
-- 8 FKs lacked a supporting index on the referencing column. Without
-- one, the FK can't help the planner with joins, and ON DELETE on the
-- target side falls back to a seq scan (slow on tables that grow).
--
-- gazetteer_entry.admin_area_id is the most impactful (23k rows,
-- ON DELETE SET NULL — district-deletes would seq-scan today).
-- The rest are small-table or future-proofing.

CREATE INDEX IF NOT EXISTS idx_gazetteer_admin_area_id
    ON public.gazetteer_entry (admin_area_id)
    WHERE admin_area_id IS NOT NULL;

-- forecast.* is owned by sister repo mushroom-forecast — skip if absent
DO $do$
BEGIN
    IF to_regclass('forecast.prediction') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_forecast_prediction_group_key
                 ON forecast.prediction (group_key)';
    END IF;
END;
$do$;

CREATE INDEX IF NOT EXISTS idx_soil_polygon_soil0
    ON public.soil_polygon (soil0_id);
CREATE INDEX IF NOT EXISTS idx_soil_polygon_soil1
    ON public.soil_polygon (soil1_id) WHERE soil1_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_soil_polygon_soil2
    ON public.soil_polygon (soil2_id) WHERE soil2_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_soil_polygon_soil3
    ON public.soil_polygon (soil3_id) WHERE soil3_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_soil_polygon_parent1
    ON public.soil_polygon (parent1_id) WHERE parent1_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_soil_polygon_parent2
    ON public.soil_polygon (parent2_id) WHERE parent2_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_refresh_token_replaced_by
    ON public.user_refresh_token (replaced_by_id) WHERE replaced_by_id IS NOT NULL;
