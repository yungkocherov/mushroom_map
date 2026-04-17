-- Добавляем версию промпта, с которой был обработан пост.
-- Когда мы меняем CLASSIFY_PROMPT или GROUP_TO_SLUGS — PHOTO_PROMPT_VERSION
-- в коде бампается, и photos-stage автоматически перегоняет все посты
-- где photo_prompt_version != текущей версии.
--
-- NULL = ещё не обработан / обработан до введения versioning'а.

ALTER TABLE vk_post
    ADD COLUMN IF NOT EXISTS photo_prompt_version TEXT;

-- Курсор Stage 3 теперь учитывает версию.
DROP INDEX IF EXISTS idx_vk_post_needs_photos;
CREATE INDEX IF NOT EXISTS idx_vk_post_needs_photos
    ON vk_post (id) WHERE photo_processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vk_post_prompt_version
    ON vk_post (photo_prompt_version);
