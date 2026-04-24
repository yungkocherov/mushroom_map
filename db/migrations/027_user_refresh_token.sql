-- user_refresh_token — хранилище refresh-токенов для /api/auth/refresh.
--
-- Модель auth (совпадает с D2 планом):
--   access_token  — short-lived JWT (15 мин), в памяти фронта, не хранится
--                   на сервере.
--   refresh_token — long-lived opaque random string (30 дней), хранится
--                   на клиенте в HttpOnly Secure cookie, на сервере
--                   только SHA-256 хэш. Одноразовый: при /refresh старая
--                   запись помечается revoked_at, выдаётся новая пара.
--
-- Почему хэш, а не raw:
--   read-only дамп БД (бэкап, тестовая реплика) не должен дать злоумышленнику
--   валидные refresh-токены. Хэш бесполезен для login, а сравнение при
--   /refresh — один digest (не заметно).
--
-- token_family_id: все токены одной цепочки rotate'ов делят одну family.
--   Если клиент приходит со старым revoked-токеном — это признак reuse
--   (кто-то украл куку), отзываем всю family целиком. Классический
--   paragon из OWASP.

CREATE TABLE IF NOT EXISTS user_refresh_token (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL
                                REFERENCES users(id) ON DELETE CASCADE,

    -- SHA-256 от (server_secret || raw_refresh_token), hex, 64 символа
    token_hash      TEXT        NOT NULL,

    -- Цепочка rotate'ов; при reuse revoked — отзываем всю family
    token_family_id UUID        NOT NULL,

    -- Лайфсайкл
    issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,                -- NULL = active; set = logout/rotate/reuse
    revoked_reason  TEXT,                       -- 'rotated' | 'logout' | 'reuse_detected' | 'admin'
    replaced_by_id  UUID        REFERENCES user_refresh_token(id) ON DELETE SET NULL,

    -- Метаданные клиента (для «активные сессии» в кабинете)
    client_ua       TEXT,
    client_ip       INET,

    CONSTRAINT user_refresh_token_hash_unq  UNIQUE (token_hash),
    CONSTRAINT user_refresh_token_reason_chk
        CHECK (revoked_reason IS NULL
               OR revoked_reason IN ('rotated', 'logout', 'reuse_detected', 'admin'))
);

-- /refresh lookup: находим по хэшу и проверяем revoked_at IS NULL
-- (покрыто UNIQUE на token_hash).

-- Покажи активные сессии юзера + отзови все при logout-all:
CREATE INDEX IF NOT EXISTS idx_urt_user_active
    ON user_refresh_token (user_id)
    WHERE revoked_at IS NULL;

-- При reuse-detect отзываем всю family:
CREATE INDEX IF NOT EXISTS idx_urt_family
    ON user_refresh_token (token_family_id);

-- Регулярный cleanup: удалять expired+revoked старше N дней.
CREATE INDEX IF NOT EXISTS idx_urt_expires
    ON user_refresh_token (expires_at);

COMMENT ON TABLE user_refresh_token IS
    'Refresh-токены (хэш SHA-256). Одноразовые, rotate при каждом /refresh. '
    'token_family_id группирует цепочку — reuse старого revoked => отзыв '
    'всей family (OWASP refresh-token rotation).';

COMMENT ON COLUMN user_refresh_token.token_hash IS
    'SHA-256(server_secret || raw_token), hex. raw живёт только у клиента в HttpOnly cookie.';

COMMENT ON COLUMN user_refresh_token.token_family_id IS
    'UUID, общий для всех rotate-потомков одного начального токена. Reuse '
    'revoked-токена => признак кражи => revoke всей family.';
