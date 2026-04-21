-- Привязка VK-поста к району (admin_area level=6) через NER+gazetteer.
--
-- Stage 5: text -> Natasha LOC spans -> GazetteerMatcher -> admin_area_id.
-- Это минимальная гранулярность, которую даёт текст VK-поста
-- («поехали в Лемболово» → Лемболово settlement → Всеволожский район).
-- Результат — ключевая фича для mushroom-forecast модели
-- (район × день × группа грибов).

ALTER TABLE vk_post
    ADD COLUMN IF NOT EXISTS district_admin_area_id INTEGER
        REFERENCES admin_area(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS district_confidence REAL,
    ADD COLUMN IF NOT EXISTS place_extracted_at TIMESTAMPTZ,
    -- Детали матчинга: raw mentions, matched name/kind/type, stopword hits.
    -- Нужно для отладки и переоценки — сам район часто неоднозначен.
    ADD COLUMN IF NOT EXISTS place_match JSONB;

-- Курсор для инкремента: WHERE place_extracted_at IS NULL
CREATE INDEX IF NOT EXISTS idx_vk_post_needs_place
    ON vk_post (id) WHERE place_extracted_at IS NULL;

-- JOIN в forecast-репо: SELECT по району
CREATE INDEX IF NOT EXISTS idx_vk_post_district
    ON vk_post (district_admin_area_id) WHERE district_admin_area_id IS NOT NULL;
