-- 036_forecast_prediction_latest.sql
--
-- forecast.prediction has accumulated 10 model_versions across 7 groups
-- (climatology_v0/v1, v0_iter1..5, two tweedie variants). Today the API
-- (services/api/src/api/routes/forecast.py) returns deterministic
-- hashes; nothing reads forecast.prediction yet — but when it does,
-- it'll need a stable «latest version per group» contract.
--
-- This migration:
--   1) creates forecast.prediction_latest VIEW that resolves «latest
--      version» as the (group_key, model_version) pair with the
--      newest predicted_at. Consumers can SELECT without tracking
--      versions.
--   2) adds idx_prediction_group_predicted_desc to make «latest per
--      group_key» fast.
--
-- Retention is intentionally NOT applied here. forecast.prediction is
-- a research workspace owned by mushroom-forecast (sister repo);
-- pruning is the trainer's call. We only make «latest» queryable.

CREATE INDEX IF NOT EXISTS idx_prediction_group_predicted_desc
    ON forecast.prediction (group_key, predicted_at DESC);

-- Pick the model_version with the most-recent predicted_at per group.
-- DISTINCT ON keeps one row per (group_key, district_id, date) — the
-- newest version. Cheap on 55k rows; will scale to 1M+ as long as the
-- (group_key, predicted_at DESC) index is present.
CREATE OR REPLACE VIEW forecast.prediction_latest AS
WITH latest_version_per_group AS (
    SELECT DISTINCT ON (group_key)
           group_key,
           model_version,
           max(predicted_at) AS latest_at
    FROM forecast.prediction
    GROUP BY group_key, model_version
    ORDER BY group_key, max(predicted_at) DESC
)
SELECT p.district_id,
       p.date,
       p.group_key,
       p.predicted_value,
       p.model_version,
       p.predicted_at
FROM forecast.prediction p
JOIN latest_version_per_group lv
  ON lv.group_key = p.group_key AND lv.model_version = p.model_version;

COMMENT ON VIEW forecast.prediction_latest IS
    'Resolves "latest model_version per group_key" by max(predicted_at). '
    'Use this from API/web instead of querying forecast.prediction with '
    'a hardcoded model_version. Historical versions remain in '
    'forecast.prediction for the mushroom-forecast trainer.';
