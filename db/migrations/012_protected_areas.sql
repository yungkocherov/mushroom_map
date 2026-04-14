-- Migration 012: protected areas (OOPT / ООПТ)
-- oopt_category values: zapovednik, nat_park, prirodny_park, zakaznik, pamyatnik, other

CREATE TABLE IF NOT EXISTS protected_area (
    id          SERIAL PRIMARY KEY,
    region_id   INTEGER REFERENCES region(id),
    externalid  TEXT UNIQUE,
    name        TEXT NOT NULL,
    oopt_category TEXT,           -- zapovednik | nat_park | prirodny_park | zakaznik | pamyatnik | other
    federal     BOOLEAN DEFAULT false,
    geometry    GEOMETRY(MultiPolygon, 4326) NOT NULL,
    area_m2     FLOAT,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS protected_area_geometry_gist
    ON protected_area USING GIST (geometry);

CREATE INDEX IF NOT EXISTS protected_area_region_id_idx
    ON protected_area (region_id);
