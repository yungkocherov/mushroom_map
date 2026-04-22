# Pipelines

ETL-скрипты. Каждый — один шаг, запускается отдельно, идемпотентен.

| Скрипт | Назначение | Phase |
|---|---|---|
| `ingest_forest.py` | Скачать лесные данные через выбранный ForestSource → forest_polygon | 2 |
| `ingest_gazetteer.py` | Наполнить gazetteer_entry из OSM + yaml-дополнений | 2 |
| `ingest_vk.py` | Обёртка над парсером ВК (копируем части из ik_mushrooms_parser) | 2 |
| `extract_places.py` | _DEPRECATED_ — старый flow для пустой таблицы observation. См. `extract_vk_districts.py`. | 2 |
| `extract_vk_districts.py` | Natasha NER + regex fallback → vk_post.district_admin_area_id | 2 |
| `build_tiles.py` | forest_unified → data/tiles/forest.pmtiles через Tippecanoe | 2 |
| `refresh_stats.py` | REFRESH MATERIALIZED VIEW observation_h3_species_stats | 2 |

Запуск:
```bash
python pipelines/ingest_forest.py --source osm --region lenoblast
python pipelines/extract_places.py --region lenoblast
python pipelines/build_tiles.py --region lenoblast
```

Оркестрация (в будущем): Prefect или простой Makefile-граф.
