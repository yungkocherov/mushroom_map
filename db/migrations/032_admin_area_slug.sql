-- 032: admin_area.slug column
--
-- ASCII slug per district (level=6) for use in URLs / file paths /
-- mobile region codes. До этого pipeline-'ы и mobile-helpers
-- пытались резолвить район по name_ru ILIKE %корень% что хрупко
-- («Лужск» матчит и «Лужский» и «Луга» если бы был такой).
--
-- Slug-vocab — ASCII транслит, по принципу:
--   <короткое прилагательное-корень>sky / sk
-- Закреплён здесь — не менять без миграции (mobile хранит slug
-- в скачанных region-пакетах, переименование сломает offline-карту
-- у юзеров).

ALTER TABLE admin_area
    ADD COLUMN slug TEXT;

UPDATE admin_area SET slug = CASE name_ru
    WHEN 'Бокситогорский район'             THEN 'boksitogorsky'
    WHEN 'Волосовский район'                THEN 'volosovsky'
    WHEN 'Волховский район'                 THEN 'volkhovsky'
    WHEN 'Всеволожский район'               THEN 'vsevolozhsky'
    WHEN 'Выборгский район'                 THEN 'vyborgsky'
    WHEN 'Гатчинский муниципальный округ'   THEN 'gatchinsky'
    WHEN 'Кингисеппский район'              THEN 'kingiseppsky'
    WHEN 'Киришский район'                  THEN 'kirishsky'
    WHEN 'Кировский район'                  THEN 'kirovsky'
    WHEN 'Лодейнопольский район'            THEN 'lodeynopolsky'
    WHEN 'Ломоносовский район'              THEN 'lomonosovsky'
    WHEN 'Лужский район'                    THEN 'luzhsky'
    WHEN 'Подпорожский район'               THEN 'podporozhsky'
    WHEN 'Приозерский район'                THEN 'priozersky'
    WHEN 'Сланцевский район'                THEN 'slantsevsky'
    WHEN 'Сосновоборский городской округ'   THEN 'sosnovoborsky'
    WHEN 'Тихвинский район'                 THEN 'tikhvinsky'
    WHEN 'Тосненский район'                 THEN 'tosnensky'
    ELSE NULL
END WHERE level = 6;

CREATE UNIQUE INDEX admin_area_slug_unique
    ON admin_area(slug)
    WHERE slug IS NOT NULL;

COMMENT ON COLUMN admin_area.slug IS
    'ASCII slug for URL / file path / mobile region pack id. NULL for non-district admin_areas (level != 6 may not have one).';
