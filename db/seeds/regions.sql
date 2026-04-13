-- Сид регионов. Запускается после миграций.
-- Идемпотентно: ON CONFLICT DO NOTHING.

INSERT INTO region (
    code, name_ru, name_en, country_iso,
    geometry,
    bbox,
    timezone, primary_vk_group, meta
)
VALUES (
    'lenoblast',
    'Ленинградская область',
    'Leningrad Oblast',
    'RU',
    -- Упрощённый контур Ленобласти (10 точек). Заменим на точный из OSM в ingest_gazetteer.
    ST_Multi(ST_GeomFromText(
        'POLYGON((27.8 58.5, 33.0 58.5, 33.0 61.8, 27.8 61.8, 27.8 58.5))',
        4326
    )),
    ST_GeomFromText(
        'POLYGON((27.8 58.5, 33.0 58.5, 33.0 61.8, 27.8 61.8, 27.8 58.5))',
        4326
    ),
    'Europe/Moscow',
    'grib_spb',
    '{"h3_resolution": 7, "forest_source_priority": ["osm"], "parser_city_key": "spb"}'::jsonb
)
ON CONFLICT (code) DO NOTHING;

-- Санкт-Петербург отдельно (для будущих наблюдений из того же VK)
INSERT INTO region (
    code, name_ru, name_en, country_iso,
    geometry, bbox,
    timezone, primary_vk_group, meta
)
VALUES (
    'spb',
    'Санкт-Петербург',
    'Saint Petersburg',
    'RU',
    ST_Multi(ST_GeomFromText(
        'POLYGON((29.7 59.8, 30.6 59.8, 30.6 60.1, 29.7 60.1, 29.7 59.8))',
        4326
    )),
    ST_GeomFromText(
        'POLYGON((29.7 59.8, 30.6 59.8, 30.6 60.1, 29.7 60.1, 29.7 59.8))',
        4326
    ),
    'Europe/Moscow',
    'grib_spb',
    '{"h3_resolution": 8, "forest_source_priority": ["osm"], "parser_city_key": "spb"}'::jsonb
)
ON CONFLICT (code) DO NOTHING;
