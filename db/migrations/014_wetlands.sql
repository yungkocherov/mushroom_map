-- Болота из OpenStreetMap (natural=wetland).
--
-- Для грибника важно по двум причинам:
--   1. Безопасность — не зайти в топь без понимания где болото.
--   2. Особая микология — клюква, морошка, подболотники, моховики растут
--      только в болотах и вокруг них.
--
-- Отдельная таблица от forest_polygon — болота не лесные полигоны, это
-- wetland-класс OSM (bog/marsh/swamp/fen/etc).

CREATE TABLE IF NOT EXISTS wetland (
    id          BIGSERIAL PRIMARY KEY,
    region_id   INTEGER REFERENCES region(id) ON DELETE CASCADE,
    osm_id      TEXT NOT NULL,         -- 'way/123' | 'relation/456'
    wetland     TEXT NOT NULL,         -- 'bog' | 'marsh' | 'swamp' | 'fen' | 'unspecified'
    name        TEXT,
    geometry    GEOMETRY(MultiPolygon, 4326) NOT NULL,
    area_m2     DOUBLE PRECISION,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (osm_id)
);

CREATE INDEX IF NOT EXISTS idx_wetland_geometry ON wetland USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_wetland_region   ON wetland (region_id);
CREATE INDEX IF NOT EXISTS idx_wetland_type     ON wetland (wetland);

COMMENT ON TABLE wetland IS
    'Болота из OSM natural=wetland. Отдельная таблица от forest_polygon '
    'т.к. это wetland-класс, не лесной полигон. Грибники используют для '
    'безопасности (не зайти в топь) и для видов specific-to-wetland '
    '(клюква, морошка, моховики, подболотники).';
