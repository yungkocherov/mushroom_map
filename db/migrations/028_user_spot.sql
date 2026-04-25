-- user_spot — сохранённые юзером места («моя поляна», «гриб в прошлом году»).
-- Минимальный MVP: точка + имя + заметка + цвет-маркер. Позже могут
-- появиться species_slug (привязка к виду из справочника), foray_date
-- (когда был, если был), photos[] — но сначала простой блокнот.
--
-- Доступ: только владелец. Никаких публичных feed'ов на этом этапе
-- (см. /legal/privacy и /legal/terms — публичные spots это явный opt-in,
-- которого не будет в MVP).

CREATE TABLE IF NOT EXISTS user_spot (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL
                            REFERENCES users(id) ON DELETE CASCADE,

    name        TEXT        NOT NULL,                    -- «Поляна за Лемболово»
    note        TEXT        NOT NULL DEFAULT '',         -- свободный текст
    color       TEXT        NOT NULL DEFAULT 'forest',   -- ярлык-цвет (UI-маркер)

    geom        GEOMETRY(Point, 4326) NOT NULL,

    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Цвет — enum в виде CHECK (а не отдельная таблица): фронту нужен
    -- набор готовых маркеров, БД достаточно подсказки. Расширяется
    -- alter-constraint'ом по мере появления новых маркеров.
    CONSTRAINT user_spot_color_chk
        CHECK (color IN ('forest', 'chanterelle', 'birch', 'moss', 'danger'))
);

-- Список «моих мест» — частый запрос, фильтр по user_id обязателен.
CREATE INDEX IF NOT EXISTS idx_user_spot_user
    ON user_spot (user_id, created_at DESC);

-- Просмотр на карте — будущий /api/cabinet/spots/in-bbox дотянется до
-- GIST'а. Заранее не оптимизируем формат, но индекс заводим.
CREATE INDEX IF NOT EXISTS idx_user_spot_geom
    ON user_spot USING GIST (geom);

COMMENT ON TABLE user_spot IS
    'Сохранённые пользователем места. Только приватное хранение, '
    'без агрегации/публичных feed''ов (Phase 5 MVP).';
