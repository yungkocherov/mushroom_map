# Pipelines

ETL-скрипты. Каждый — один шаг, запускается отдельно, идемпотентен.

| Скрипт | Назначение |
|---|---|
| `scrape_fgislk_attrinfo.py` | Качает выделы из ФГИС ЛК через attributesinfo + WMS → GeoJSON. См. CLAUDE.md §Common commands. |
| `ingest_forest.py` | GeoJSON → forest_polygon (по `--source` каскад приоритетов). |
| `ingest_districts.py` | OSM admin_level=6 → admin_area + region.geometry. |
| `ingest_oopt.py` / `ingest_osm_roads.py` / `ingest_waterway.py` / `ingest_wetlands.py` / `ingest_water_zones.py` | OSM → соответствующие таблицы. |
| `ingest_felling.py` / `ingest_protective.py` | felling_area / protective_forest. **TODO**: путь генерации GeoJSON был на старом MVT-flow (удалён 2026-05-04); новый путь через scrape_fgislk_attrinfo не реализован. Re-ingest сейчас невозможен — данные в БД с предыдущего прогона. |
| `ingest_soil.py` | Почвенная карта Докучаевского ин-та. |
| `ingest_adjacent_subjects.py` | Карелия + Новгородская/Псковская/Тверская/Вологодская — для расширения покрытия. |
| `load_gazetteer.py` | Топонимы OSM (places/lakes/rivers) → gazetteer_entry. |
| `extract_vk_districts.py` | Natasha NER + regex → vk_post.district_admin_area_id. |
| `ingest_vk.py` | VK-flow: collect → dates → photos (LM Studio classify). |
| `seed_vk_posts.py` | Импорт исторических постов из дампа. |
| `build_tiles.py` | forest_unified → data/tiles/forest.pmtiles. |
| `build_*_tiles.py` | Прочие PMTiles (oopt, roads, waterway, wetlands, soil, terrain, hillshade, felling, protective, district). |
| `build_basemap.py` | OpenMapTiles bundled basemap для мобилки. |
| `vk_photos_report.py` | HTML-отчёт по случайным постам с photo-классификацией. |

Подробные команды и DSN — в `CLAUDE.md` §Common commands.
