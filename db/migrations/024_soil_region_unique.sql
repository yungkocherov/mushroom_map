-- Bugfix: soil_polygon.poligon_id был UNIQUE глобально, а исходный shapefile
-- Докучаевского ин-та 1:2.5M имеет poligon_id уникальным только в рамках
-- всей карты; при фильтрации по bbox одного региона те же poligon_id'ы
-- попадают в несколько регионов (граничные случаи). Наш прошлый ingest с
-- `ON CONFLICT (poligon_id) DO UPDATE SET region_id = EXCLUDED.region_id`
-- при последовательном прогоне ingest_soil по 5 соседним субъектам потерял
-- LO-полигоны — каждая запись «мигрировала» к последнему INSERT-еру
-- (Вологодская осталась с 526 строками, LO пусто).
--
-- Правильная уникальность: (region_id, poligon_id). Это позволяет тому же
-- исходному poligon_id присутствовать в нескольких region_id независимо.
--
-- Same risk existed in osm_waterway (OSM way_id как PK) и в любых таблицах,
-- где внешний id уникален глобально и импортируется по регионам. Для
-- waterway фикс не делаем сейчас — всегда ingest'им только LO. TODO если
-- пойдём в multi-region OSM ingest.

ALTER TABLE soil_polygon
    DROP CONSTRAINT IF EXISTS soil_polygon_poligon_id_key;

ALTER TABLE soil_polygon
    ADD CONSTRAINT soil_polygon_region_poligon_uk
    UNIQUE (region_id, poligon_id);
