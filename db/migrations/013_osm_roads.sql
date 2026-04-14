-- Migration 013: OSM road network (track, path, footway, bridleway, cycleway)

CREATE TABLE IF NOT EXISTS osm_road (
    id          BIGINT PRIMARY KEY,   -- OSM way ID
    region_id   INTEGER REFERENCES region(id),
    highway     TEXT NOT NULL,        -- track | path | footway | bridleway | cycleway | ...
    name        TEXT,
    geometry    GEOMETRY(LineString, 4326) NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS osm_road_geometry_gist
    ON osm_road USING GIST (geometry);

CREATE INDEX IF NOT EXISTS osm_road_region_id_idx
    ON osm_road (region_id);
