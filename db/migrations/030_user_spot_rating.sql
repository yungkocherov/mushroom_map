-- 030: user_spot.color → user_spot.rating
--
-- User decision (2026-04-29): replace color enum (forest/chanterelle/birch/moss/danger)
-- with quality rating 1-5 (1=плохое, 5=отличное). Marker color in UI derives from rating.
--
-- Backfill mapping for existing rows:
--   forest      → 4 (хорошее, default)
--   chanterelle → 4 (нашёл что-то ценное)
--   moss        → 3 (нейтрально)
--   birch       → 3 (нейтрально)
--   danger      → 1 (плохое — единственная негативная категория)

ALTER TABLE user_spot
    ADD COLUMN rating SMALLINT NOT NULL DEFAULT 3
        CHECK (rating BETWEEN 1 AND 5);

UPDATE user_spot
   SET rating = CASE color
       WHEN 'forest'      THEN 4
       WHEN 'chanterelle' THEN 4
       WHEN 'moss'        THEN 3
       WHEN 'birch'       THEN 3
       WHEN 'danger'      THEN 1
       ELSE 3
   END;

ALTER TABLE user_spot
    DROP CONSTRAINT IF EXISTS user_spot_color_chk;

ALTER TABLE user_spot
    DROP COLUMN color;

COMMENT ON COLUMN user_spot.rating IS
    '1-5 оценка качества места (1=плохое, 5=отличное). Цвет маркера на карте — производная от rating.';
