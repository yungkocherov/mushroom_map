-- 035_district_level_guard.sql
--
-- admin_area mixes level=6 (18 LO districts) and level=4
-- (5 neighboring oblasts: Novgorod, Tver, Vologda, Karelia, Pskov).
-- All forecast.* tables and vk_post.district_admin_area_id semantically
-- reference districts (level=6) but their FKs accept any admin_area id.
-- Today the contract holds (all 41508 vk_post FKs and 218k+ forecast
-- rows point to level=6) — but it's enforced by convention, not
-- structure. This migration adds explicit guard triggers.
--
-- Approach: BEFORE INSERT/UPDATE trigger that raises if NEW.<col>
-- references an admin_area with level != 6.
--
-- forecast.* tables are owned by the sister repo mushroom-forecast
-- and are absent in this repo's CI test stack. Forecast triggers are
-- created conditionally — IF the schema/tables exist.

CREATE OR REPLACE FUNCTION public.assert_district_is_lo_level6()
RETURNS TRIGGER AS $$
DECLARE
    col text := TG_ARGV[0];
    val int;
    lvl int;
BEGIN
    EXECUTE format('SELECT ($1).%I', col) INTO val USING NEW;
    IF val IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT level INTO lvl FROM public.admin_area WHERE id = val;
    IF lvl IS DISTINCT FROM 6 THEN
        RAISE EXCEPTION
          '%.%=% must reference admin_area with level=6, got level=%',
          TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, col, val,
          COALESCE(lvl::text, '<missing row>');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- vk_post.district_admin_area_id (always present in this repo)
DROP TRIGGER IF EXISTS trg_vk_post_district_level6 ON public.vk_post;
CREATE TRIGGER trg_vk_post_district_level6
    BEFORE INSERT OR UPDATE OF district_admin_area_id ON public.vk_post
    FOR EACH ROW EXECUTE FUNCTION public.assert_district_is_lo_level6('district_admin_area_id');

-- forecast.* tables — conditional. The forecast schema is migrated by
-- the sister repo (mushroom-forecast). Skip silently if absent.
DO $do$
BEGIN
    IF to_regclass('forecast.weather_features') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trg_weather_features_district_level6 ON forecast.weather_features';
        EXECUTE 'CREATE TRIGGER trg_weather_features_district_level6
                 BEFORE INSERT OR UPDATE OF district_id ON forecast.weather_features
                 FOR EACH ROW EXECUTE FUNCTION public.assert_district_is_lo_level6(''district_id'')';
    END IF;

    IF to_regclass('forecast.weather_daily') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trg_weather_daily_district_level6 ON forecast.weather_daily';
        EXECUTE 'CREATE TRIGGER trg_weather_daily_district_level6
                 BEFORE INSERT OR UPDATE OF district_id ON forecast.weather_daily
                 FOR EACH ROW EXECUTE FUNCTION public.assert_district_is_lo_level6(''district_id'')';
    END IF;

    IF to_regclass('forecast.prediction') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trg_prediction_district_level6 ON forecast.prediction';
        EXECUTE 'CREATE TRIGGER trg_prediction_district_level6
                 BEFORE INSERT OR UPDATE OF district_id ON forecast.prediction
                 FOR EACH ROW EXECUTE FUNCTION public.assert_district_is_lo_level6(''district_id'')';

        -- Tighten ON DELETE behaviour to CASCADE for consistency with
        -- the other forecast.* tables. prediction was the odd one out.
        EXECUTE 'ALTER TABLE forecast.prediction
                 DROP CONSTRAINT IF EXISTS prediction_district_id_fkey';
        EXECUTE 'ALTER TABLE forecast.prediction
                 ADD CONSTRAINT prediction_district_id_fkey
                 FOREIGN KEY (district_id) REFERENCES public.admin_area(id) ON DELETE CASCADE';
    END IF;

    IF to_regclass('forecast.training_sample') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trg_training_sample_district_level6 ON forecast.training_sample';
        EXECUTE 'CREATE TRIGGER trg_training_sample_district_level6
                 BEFORE INSERT OR UPDATE OF district_id ON forecast.training_sample
                 FOR EACH ROW EXECUTE FUNCTION public.assert_district_is_lo_level6(''district_id'')';
    END IF;

    IF to_regclass('forecast.district_features') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trg_district_features_district_level6 ON forecast.district_features';
        EXECUTE 'CREATE TRIGGER trg_district_features_district_level6
                 BEFORE INSERT OR UPDATE OF district_id ON forecast.district_features
                 FOR EACH ROW EXECUTE FUNCTION public.assert_district_is_lo_level6(''district_id'')';
    END IF;
END;
$do$;
