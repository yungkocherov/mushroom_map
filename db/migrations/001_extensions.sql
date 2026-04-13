-- Расширения PostGIS и вспомогательные
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- нечёткий поиск по названиям
CREATE EXTENSION IF NOT EXISTS unaccent;     -- нормализация русских строк
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- составные гео-индексы

-- H3 (если доступен). Если нет — можно посчитать H3 в Python и хранить как TEXT.
-- CREATE EXTENSION IF NOT EXISTS h3;
-- CREATE EXTENSION IF NOT EXISTS h3_postgis;
