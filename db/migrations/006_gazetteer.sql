-- Газеттир: справочник топонимов (урочища, деревни, озёра, «грибные места»).
-- Используется сервисом placenames для привязки упоминаний из постов к геометрии.

CREATE TABLE IF NOT EXISTS gazetteer_entry (
    id           SERIAL PRIMARY KEY,
    region_id    INTEGER REFERENCES region(id) ON DELETE CASCADE,
    name_ru      TEXT NOT NULL,                    -- каноническое название
    name_normalized TEXT NOT NULL,                 -- lower + unaccent (для поиска)
    aliases      TEXT[] NOT NULL DEFAULT '{}',     -- 'Лемболово', 'Лемболовские озёра', 'Лемболовская возв.'
    kind         TEXT NOT NULL,                    -- 'settlement'|'tract'|'lake'|'river'|'district'|'station'|'poi'
    admin_area_id INTEGER REFERENCES admin_area(id) ON DELETE SET NULL,
    point        GEOMETRY(Point, 4326) NOT NULL,   -- центроид или типичная точка
    geometry     GEOMETRY(Geometry, 4326),         -- опционально — полигон/линия
    popularity   INTEGER NOT NULL DEFAULT 0,       -- как часто встречается в данных (для disambiguation)
    source       TEXT NOT NULL,                    -- 'osm'|'manual'|'wikidata'
    meta         JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_gazetteer_point    ON gazetteer_entry USING GIST (point);
CREATE INDEX IF NOT EXISTS idx_gazetteer_geom     ON gazetteer_entry USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_gazetteer_name_trgm ON gazetteer_entry USING GIN (name_normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_gazetteer_aliases  ON gazetteer_entry USING GIN (aliases);
CREATE INDEX IF NOT EXISTS idx_gazetteer_region   ON gazetteer_entry (region_id, kind);
