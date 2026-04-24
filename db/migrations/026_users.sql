-- users — аккаунты сайта. Auth-провайдер-агностичная форма:
-- одна запись = один человек, привязка к OAuth-identity через
-- (auth_provider, provider_subject) UNIQUE. Если когда-нибудь потребуется
-- несколько identity на одного юзера (VK + Google на том же email), это
-- отделится в user_identity без переразложения users.
--
-- email — nullable: VK ID без доп. scope не отдаёт email; FAANG / Apple
-- пускают скрытые relay-адреса. UNIQUE применяется только к непустым
-- значениям (partial index), так что несколько «безэмейльных» юзеров
-- не конфликтуют.
--
-- status вместо deleted_at: 'active' | 'banned' | 'deleted' — явное
-- перечисление состояний, без NULL-ветвления в запросах.

CREATE TABLE IF NOT EXISTS users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- OAuth identity
    auth_provider       TEXT        NOT NULL,                   -- 'yandex' | 'google' | 'vk' | ...
    provider_subject    TEXT        NOT NULL,                   -- 'sub' из провайдера (стабильный id юзера)

    -- Профиль (всё, что можно не присылать — nullable)
    email               TEXT,                                   -- может быть NULL (см. коммент)
    email_verified      BOOLEAN     NOT NULL DEFAULT FALSE,     -- доверяем только тому, что провайдер пометил как verified
    display_name        TEXT,                                   -- «как показывать» — не login, может меняться
    avatar_url          TEXT,
    locale              TEXT,                                   -- 'ru' | 'en' | ...

    -- Лайфсайкл
    status              TEXT        NOT NULL DEFAULT 'active',  -- 'active' | 'banned' | 'deleted'
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at       TIMESTAMPTZ,

    CONSTRAINT users_status_chk
        CHECK (status IN ('active', 'banned', 'deleted')),

    CONSTRAINT users_provider_subject_unq
        UNIQUE (auth_provider, provider_subject)
);

-- email UNIQUE, но только для непустых значений:
-- несколько аккаунтов без email (VK без scope) не должны конфликтовать.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unq
    ON users (lower(email))
    WHERE email IS NOT NULL;

-- Быстрый lookup по провайдеру при логине (всегда идёт WHERE auth_provider=? AND provider_subject=?;
-- purpose-built UNIQUE выше уже служит индексом, дублировать не нужно).

COMMENT ON TABLE users IS
    'Аккаунты сайта. Привязка к OAuth: (auth_provider, provider_subject) UNIQUE. '
    'email nullable (VK/Apple relay), UNIQUE только при наличии. '
    'status: active|banned|deleted (soft-delete без NULL-ветвления).';

COMMENT ON COLUMN users.provider_subject IS
    'Поле sub из OIDC / user.id из OAuth-провайдера. Стабильный ID юзера у провайдера.';

COMMENT ON COLUMN users.email_verified IS
    'TRUE только если провайдер подтвердил email. Не доверяем «само-указанному».';
