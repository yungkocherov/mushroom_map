-- Водоохранные зоны из ФГИС ЛК: леса в водоохранных зонах рек/озёр,
-- нерестоохранные полосы. Отдельная таблица — не лесные полигоны, а
-- административные охранные зоны поверх леса.

CREATE TABLE IF NOT EXISTS water_zone (
    id          BIGSERIAL PRIMARY KEY,
    region_id   INTEGER REFERENCES region(id) ON DELETE CASCADE,
    externalid  TEXT NOT NULL,
    zone_type   TEXT NOT NULL,  -- 'Водоохранная зона' | 'Нерестоохранные полосы лесов' | ...
    layer_name  TEXT NOT NULL,  -- исходный MVT-слой ФГИС ЛК
    geometry    GEOMETRY(MultiPolygon, 4326) NOT NULL,
    area_m2     DOUBLE PRECISION,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (externalid)
);

CREATE INDEX IF NOT EXISTS idx_water_zone_geometry ON water_zone USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_water_zone_region   ON water_zone (region_id);
CREATE INDEX IF NOT EXISTS idx_water_zone_type     ON water_zone (zone_type);

COMMENT ON TABLE water_zone IS
    'Водоохранные зоны из ФГИС ЛК: леса в ВОЗ, нерестоохранные полосы. '
    'Маркер влажных местообитаний для грибного картирования.';
