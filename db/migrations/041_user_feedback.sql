-- 2026-05-10: user_feedback — обратная связь от посетителей сайта.
--
-- Минимальная таблица: текст + опционально контакт (email/tg/что-то)
-- + текущий URL и user-agent для контекста. Если юзер залогинен —
-- пишем user_id, чтобы не спрашивать кто; для анонимов NULL.
--
-- Просмотр для автора:
--   SELECT created_at, contact, page_url, message
--   FROM user_feedback ORDER BY created_at DESC LIMIT 50;
--
-- Без апдейтов — фидбэк append-only. RESOLVED-флаг можно добавить
-- следующей миграцией если понадобится workflow.

CREATE TABLE IF NOT EXISTS user_feedback (
    id           BIGSERIAL PRIMARY KEY,
    user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    -- свободный текст. Жёсткий лимит 4000 chars — клиент валидирует
    -- + сервер обрезает на всякий случай.
    message      TEXT NOT NULL CHECK (char_length(message) BETWEEN 3 AND 4000),
    -- email / телефон / tg / что юзер сам напишет; null = «без ответа,
    -- просто оставлю фидбэк». 200 chars хватит на любой mailto/tel/@.
    contact      TEXT CHECK (contact IS NULL OR char_length(contact) <= 200),
    -- URL страницы откуда отправлено (`window.location.href`). Помогает
    -- понять контекст бага.
    page_url     TEXT CHECK (page_url IS NULL OR char_length(page_url) <= 1000),
    -- `navigator.userAgent` обрезанный до 500.
    user_agent   TEXT CHECK (user_agent IS NULL OR char_length(user_agent) <= 500),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_feedback_created
    ON user_feedback (created_at DESC);
