-- Добавляем два вида которых не было в seed:
--   pleurotus-ostreatus — Вешенка обыкновенная (на древесине лиственных)
--   verpa-bohemica      — Сморчковая шапочка (весенний, группа со сморчком)
--
-- Оба нужны чтобы VK-пайплайн мог маппить Gemma-ключи `oyster` и
-- `spring_mushroom` на реальные species_id.

INSERT INTO species (slug, name_ru, name_lat, synonyms, edibility, season_months, description)
VALUES
  ('pleurotus-ostreatus',
   'Вешенка обыкновенная',
   'Pleurotus ostreatus',
   ARRAY['вешенка','устричный гриб'],
   'edible',
   ARRAY[5,6,7,8,9,10,11],
   'Крупные веерообразные шляпки на живых и мёртвых лиственных деревьях. Растёт колониями.'),
  ('verpa-bohemica',
   'Сморчковая шапочка',
   'Verpa bohemica',
   ARRAY['шапочка сморчковая'],
   'conditionally_edible',
   ARRAY[4,5],
   'Весенний гриб, шляпка свободно сидит на ножке. В осиново-берёзовых лесах.')
ON CONFLICT (slug) DO NOTHING;
