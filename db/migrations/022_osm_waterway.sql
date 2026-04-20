-- OSM водотоки: ручьи, реки (линейные), каналы, канавы, дренажи.
--
-- Полигональные водоёмы (озёра/моря, реки-полигоны) уже в water_zone из ФГИСЛК.
-- Здесь — линейные waterway из OSM: критичный сигнал для модели грибов
-- (расстояние до воды → влажность → плодоношение). Используется через
-- /api/water/distance/at для feature-extractor sister-репо ik_mushrooms_parser.

CREATE TABLE IF NOT EXISTS osm_waterway (
    id            BIGINT PRIMARY KEY,   -- OSM way ID
    region_id     INTEGER REFERENCES region(id),
    waterway      TEXT NOT NULL,        -- stream | river | canal | drain | ditch
    name          TEXT,
    intermittent  BOOLEAN,              -- пересыхающий?
    geometry      GEOMETRY(LineString, 4326) NOT NULL,
    ingested_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS osm_waterway_geometry_gist
    ON osm_waterway USING GIST (geometry);

CREATE INDEX IF NOT EXISTS osm_waterway_region_id_idx
    ON osm_waterway (region_id);

CREATE INDEX IF NOT EXISTS osm_waterway_type_idx
    ON osm_waterway (waterway);

COMMENT ON TABLE osm_waterway IS
    'OSM linear waterways (stream/river/canal/drain/ditch). For mushroom '
    'prediction model: distance-to-water is a strong moisture proxy. '
    'Polygonal water bodies live in water_zone (ФГИСЛК) — kept separate.';
