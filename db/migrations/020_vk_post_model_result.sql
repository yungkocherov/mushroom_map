-- Хранит результаты классификации фото отдельно для каждой модели.
-- UNIQUE(vk_post_id, model) — одна запись на (пост, модель), обновляется
-- при перегоне с новым prompt_version той же модели.
-- vk_post.photo_species остаётся как «текущий канонический» результат
-- для стадии promote (обновляется при каждом запуске, последняя модель побеждает).

CREATE TABLE IF NOT EXISTS vk_post_model_result (
    id             BIGSERIAL PRIMARY KEY,
    vk_post_id     BIGINT NOT NULL REFERENCES vk_post(id) ON DELETE CASCADE,
    model          TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    photo_species  JSONB,
    processed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (vk_post_id, model)
);

CREATE INDEX IF NOT EXISTS idx_vk_post_model_result_post
    ON vk_post_model_result (vk_post_id);
CREATE INDEX IF NOT EXISTS idx_vk_post_model_result_model
    ON vk_post_model_result (model);

-- Переносим уже существующие результаты Gemma из vk_post.photo_species
INSERT INTO vk_post_model_result (vk_post_id, model, prompt_version, photo_species, processed_at)
SELECT id,
       'google/gemma-3-12b',
       COALESCE(photo_prompt_version, 'v7-compact-2026-04-17'),
       photo_species,
       COALESCE(photo_processed_at, now())
FROM vk_post
WHERE photo_processed_at IS NOT NULL
  AND photo_species IS NOT NULL
ON CONFLICT (vk_post_id, model) DO NOTHING;
