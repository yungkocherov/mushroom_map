-- Seed: справочник видов грибов.
-- Сгенерирован из db/seeds/species_registry.yaml
-- Идемпотентный: ON CONFLICT DO NOTHING / DO UPDATE.

BEGIN;

-- ─── species ────────────────────────────────────────────────────────────────

INSERT INTO species (slug, name_ru, name_lat, synonyms, edibility, season_months, description) VALUES
  ('boletus-edulis',          'Белый гриб',                 'Boletus edulis',           ARRAY['боровик','белый','коровка'],                          'edible',               ARRAY[6,7,8,9,10],  'Король грибов. Микориза с хвойными и берёзой.'),
  ('leccinum-scabrum',        'Подберёзовик обыкновенный',  'Leccinum scabrum',         ARRAY['обабок','берёзовик','черноголовик'],                  'edible',               ARRAY[6,7,8,9,10],  'Строгая микориза с берёзой. Массовый гриб.'),
  ('leccinum-aurantiacum',    'Подосиновик красный',        'Leccinum aurantiacum',     ARRAY['красноголовик','осиновик','красный'],                 'edible',               ARRAY[6,7,8,9,10],  'Ярко-оранжевая шляпка, растёт под осинами и берёзами.'),
  ('suillus-luteus',          'Маслёнок настоящий',         'Suillus luteus',           ARRAY['маслёнок','жёлтый маслёнок'],                        'edible',               ARRAY[6,7,8,9,10],  'Молодые сосняки — излюбленное место. Скользкая шляпка.'),
  ('suillus-granulatus',      'Маслёнок зернистый',         'Suillus granulatus',       ARRAY['летний маслёнок'],                                   'edible',               ARRAY[6,7,8,9],     'Сухие сосняки, часто большими семьями.'),
  ('xerocomus-subtomentosus', 'Моховик зелёный',            'Xerocomellus subtomentosus',ARRAY['моховик'],                                          'edible',               ARRAY[6,7,8,9,10],  'Хвойные и смешанные леса, во мху.'),
  ('cantharellus-cibarius',   'Лисичка обыкновенная',       'Cantharellus cibarius',    ARRAY['лисичка','петушок'],                                 'edible',               ARRAY[6,7,8,9],     'Не червивеет. Микориза с елью, сосной, берёзой.'),
  ('craterellus-tubaeformis', 'Лисичка трубчатая',          'Craterellus tubaeformis',  ARRAY['зимняя лисичка'],                                    'edible',               ARRAY[9,10,11],     'Осенняя лисичка, плотными колониями во мху ельников.'),
  ('lactarius-deliciosus',    'Рыжик сосновый',             'Lactarius deliciosus',     ARRAY['рыжик','рыжик обыкновенный'],                        'edible',               ARRAY[7,8,9,10],    'Молодые сосняки, на опушках. Оранжевый млечный сок.'),
  ('lactarius-resimus',       'Груздь настоящий',           'Lactarius resimus',        ARRAY['груздь','белый груздь','сырой груздь'],               'conditionally_edible', ARRAY[7,8,9],       'Берёзовые и смешанные леса. Требует вымачивания.'),
  ('lactarius-torminosus',    'Волнушка розовая',           'Lactarius torminosus',     ARRAY['волнушка','волжанка'],                               'conditionally_edible', ARRAY[7,8,9,10],    'Строгая микориза с берёзой. Для соления.'),
  ('lactarius-rufus',         'Горькушка',                  'Lactarius rufus',          ARRAY['горькая','горькуша'],                                'conditionally_edible', ARRAY[7,8,9,10],    'Во мху хвойных лесов. Для длительного засола.'),
  ('russula-vesca',           'Сыроежка пищевая',           'Russula vesca',            ARRAY['сыроежка'],                                          'edible',               ARRAY[6,7,8,9],     'Один из многих видов сыроежек в лиственных лесах.'),
  ('armillaria-mellea',       'Опёнок осенний',             'Armillaria mellea',        ARRAY['опята','осенние опята'],                             'edible',               ARRAY[8,9,10],      'Пни и живые деревья лиственных пород. Большие колонии.'),
  ('kuehneromyces-mutabilis', 'Опёнок летний',              'Kuehneromyces mutabilis',  ARRAY['летний опёнок'],                                     'edible',               ARRAY[6,7,8,9],     'На пнях и валежнике лиственных пород.'),
  ('morchella-esculenta',     'Сморчок настоящий',          'Morchella esculenta',      ARRAY['сморчок'],                                           'conditionally_edible', ARRAY[4,5],         'На открытых местах, старых кострищах, в лиственных лесах.'),
  ('gyromitra-esculenta',     'Строчок обыкновенный',       'Gyromitra esculenta',      ARRAY['строчок'],                                           'toxic',                ARRAY[4,5],         'Песчаные сосняки, вырубки. ВНИМАНИЕ: ядовит, содержит гиромитрин.'),
  ('macrolepiota-procera',    'Гриб-зонтик пёстрый',        'Macrolepiota procera',     ARRAY['зонтик','зонт'],                                     'edible',               ARRAY[7,8,9,10],    'Опушки, луга, светлые лиственные леса.'),
  ('amanita-phalloides',      'Бледная поганка',            'Amanita phalloides',       ARRAY['поганка'],                                           'deadly',               ARRAY[7,8,9,10],    'СМЕРТЕЛЬНО ЯДОВИТА. Похожа на зелёную сыроежку.'),
  ('amanita-muscaria',        'Мухомор красный',            'Amanita muscaria',         ARRAY['мухомор'],                                           'toxic',                ARRAY[7,8,9,10],    'Микоризный партнёр берёзы и ели. Ядовит.'),
  ('amanita-citrina',         'Мухомор поганковидный',      'Amanita citrina',          ARRAY['жёлтый мухомор'],                                    'inedible',             ARRAY[7,8,9,10],    'Неприятный запах картофеля. Несъедобен.'),
  ('imleria-badia',           'Польский гриб',              'Imleria badia',            ARRAY['польский','панский','моховик каштановый'],           'edible',               ARRAY[7,8,9,10],    'Замена белому в хвойных лесах. Синеет на срезе.'),
  ('leccinum-versipelle',     'Подосиновик жёлто-бурый',    'Leccinum versipelle',      ARRAY['красноголовик берёзовый','челыш'],                   'edible',               ARRAY[6,7,8,9],     'Растёт под берёзой, не под осиной — путать не надо.')
ON CONFLICT (slug) DO UPDATE SET
  name_ru       = EXCLUDED.name_ru,
  name_lat      = EXCLUDED.name_lat,
  synonyms      = EXCLUDED.synonyms,
  edibility     = EXCLUDED.edibility,
  season_months = EXCLUDED.season_months,
  description   = EXCLUDED.description,
  updated_at    = now();

-- ─── species_forest_affinity ────────────────────────────────────────────────

INSERT INTO species_forest_affinity (species_id, forest_type, affinity)
SELECT s.id, fa.forest_type, fa.affinity
FROM (VALUES
  -- boletus-edulis
  ('boletus-edulis',          'pine',             0.95),
  ('boletus-edulis',          'spruce',           0.90),
  ('boletus-edulis',          'birch',            0.85),
  ('boletus-edulis',          'oak',              0.80),
  ('boletus-edulis',          'mixed_coniferous', 0.90),
  ('boletus-edulis',          'mixed',            0.85),
  -- leccinum-scabrum
  ('leccinum-scabrum',        'birch',            1.00),
  ('leccinum-scabrum',        'mixed_broadleaved',0.70),
  ('leccinum-scabrum',        'mixed',            0.70),
  -- leccinum-aurantiacum
  ('leccinum-aurantiacum',    'aspen',            1.00),
  ('leccinum-aurantiacum',    'birch',            0.60),
  ('leccinum-aurantiacum',    'mixed_broadleaved',0.70),
  ('leccinum-aurantiacum',    'mixed',            0.60),
  -- suillus-luteus
  ('suillus-luteus',          'pine',             1.00),
  ('suillus-luteus',          'mixed_coniferous', 0.70),
  -- suillus-granulatus
  ('suillus-granulatus',      'pine',             1.00),
  ('suillus-granulatus',      'mixed_coniferous', 0.60),
  -- xerocomus-subtomentosus
  ('xerocomus-subtomentosus', 'spruce',           0.70),
  ('xerocomus-subtomentosus', 'pine',             0.60),
  ('xerocomus-subtomentosus', 'mixed_coniferous', 0.70),
  ('xerocomus-subtomentosus', 'birch',            0.50),
  -- cantharellus-cibarius
  ('cantharellus-cibarius',   'spruce',           0.90),
  ('cantharellus-cibarius',   'pine',             0.85),
  ('cantharellus-cibarius',   'birch',            0.70),
  ('cantharellus-cibarius',   'mixed_coniferous', 0.90),
  ('cantharellus-cibarius',   'mixed',            0.80),
  -- craterellus-tubaeformis
  ('craterellus-tubaeformis', 'spruce',           0.95),
  ('craterellus-tubaeformis', 'mixed_coniferous', 0.80),
  -- lactarius-deliciosus
  ('lactarius-deliciosus',    'pine',             1.00),
  ('lactarius-deliciosus',    'mixed_coniferous', 0.60),
  -- lactarius-resimus
  ('lactarius-resimus',       'birch',            0.90),
  ('lactarius-resimus',       'mixed_broadleaved',0.60),
  ('lactarius-resimus',       'mixed',            0.60),
  -- lactarius-torminosus
  ('lactarius-torminosus',    'birch',            1.00),
  ('lactarius-torminosus',    'mixed',            0.50),
  -- lactarius-rufus
  ('lactarius-rufus',         'pine',             0.90),
  ('lactarius-rufus',         'spruce',           0.70),
  ('lactarius-rufus',         'mixed_coniferous', 0.85),
  -- russula-vesca
  ('russula-vesca',           'birch',            0.70),
  ('russula-vesca',           'oak',              0.70),
  ('russula-vesca',           'mixed_broadleaved',0.80),
  ('russula-vesca',           'mixed',            0.70),
  -- armillaria-mellea
  ('armillaria-mellea',       'birch',            0.80),
  ('armillaria-mellea',       'aspen',            0.80),
  ('armillaria-mellea',       'oak',              0.80),
  ('armillaria-mellea',       'spruce',           0.70),
  ('armillaria-mellea',       'mixed_broadleaved',0.90),
  ('armillaria-mellea',       'mixed',            0.90),
  -- kuehneromyces-mutabilis
  ('kuehneromyces-mutabilis', 'birch',            0.80),
  ('kuehneromyces-mutabilis', 'aspen',            0.70),
  ('kuehneromyces-mutabilis', 'mixed_broadleaved',0.80),
  ('kuehneromyces-mutabilis', 'mixed',            0.70),
  -- morchella-esculenta
  ('morchella-esculenta',     'mixed_broadleaved',0.80),
  ('morchella-esculenta',     'aspen',            0.60),
  ('morchella-esculenta',     'oak',              0.60),
  ('morchella-esculenta',     'mixed',            0.60),
  -- gyromitra-esculenta
  ('gyromitra-esculenta',     'pine',             0.90),
  ('gyromitra-esculenta',     'mixed_coniferous', 0.70),
  -- macrolepiota-procera
  ('macrolepiota-procera',    'mixed_broadleaved',0.60),
  ('macrolepiota-procera',    'mixed',            0.50),
  ('macrolepiota-procera',    'birch',            0.50),
  -- amanita-phalloides
  ('amanita-phalloides',      'oak',              0.90),
  ('amanita-phalloides',      'mixed_broadleaved',0.80),
  ('amanita-phalloides',      'mixed',            0.50),
  -- amanita-muscaria
  ('amanita-muscaria',        'birch',            0.80),
  ('amanita-muscaria',        'spruce',           0.80),
  ('amanita-muscaria',        'pine',             0.60),
  ('amanita-muscaria',        'mixed',            0.80),
  -- amanita-citrina
  ('amanita-citrina',         'pine',             0.70),
  ('amanita-citrina',         'spruce',           0.60),
  ('amanita-citrina',         'birch',            0.50),
  ('amanita-citrina',         'mixed',            0.60),
  -- imleria-badia
  ('imleria-badia',           'pine',             0.90),
  ('imleria-badia',           'spruce',           0.70),
  ('imleria-badia',           'mixed_coniferous', 0.85),
  -- leccinum-versipelle
  ('leccinum-versipelle',     'birch',            1.00),
  ('leccinum-versipelle',     'mixed',            0.60)
) AS fa(slug, forest_type, affinity)
JOIN species s ON s.slug = fa.slug
ON CONFLICT (species_id, forest_type) DO UPDATE SET
  affinity = EXCLUDED.affinity;

COMMIT;

-- Проверка
SELECT COUNT(*) AS species_count FROM species;
SELECT COUNT(*) AS affinity_rows FROM species_forest_affinity;
