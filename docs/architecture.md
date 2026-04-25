# Архитектура mushroom-map

## Цели

1. **Интерактивная карта**, где леса раскрашены по доминирующей породе, а при клике виден список грибов с бонитетом и запасом.
2. **Две линии данных**:
   - *Теоретическая* — справочник «вид ↔ тип леса» (работает без наблюдений)
   - *Эмпирическая* — агрегация упоминаний видов в ВК-группах, привязанных к H3-ячейкам через NER топонимов
3. **Масштабирование**: новые территории, виды, источники встраиваются без переписывания.
4. **Путь к точности**: смена источника леса (OSM → Rosleshoz → Copernicus) без изменения API и фронта.

## Модули

```
mushroom-map/
├── db/                    # PostgreSQL + PostGIS миграции (001..013) и сиды
│
├── services/
│   ├── geodata/           # ForestSource абстракция → OSM, Copernicus, Rosleshoz
│   │                      # + нормализация в forest_polygon
│   │
│   ├── placenames/        # Natasha NER + газеттир Ленобласти
│   │                      # (заготовка — не запускалась)
│   │
│   ├── species_registry/  # конвертер species_registry.yaml → SQL
│   │
│   ├── api/               # FastAPI: /api/forest/at, /api/species/search, /tiles/
│   │
│   └── web/               # React + TypeScript + Vite 5 + MapLibre GL
│
├── pipelines/             # ETL-скрипты (ingest_*, build_*_tiles, fgislk_tiles_to_geojson)
│
└── docs/
```

## Схема базы данных

```sql
-- Лесные данные
forest_source           -- источники: osm(10), terranorte(45), copernicus(50), rosleshoz(60)
forest_polygon          -- полигоны: source, dominant_species, species_composition,
                        --           bonitet, timber_stock, age_group в meta JSONB,
                        --           geometry MULTIPOLYGON 4326
forest_unified          -- VIEW: DISTINCT ON (geometry hash) с MAX(priority)

-- Справочник видов
species                 -- slug, name_ru, name_lat, edibility, season_months
species_forest_affinity -- species_id, forest_type, affinity 0..1

-- Дополнительные слои
water_zone              -- водоохранные зоны (geometry POLYGON/MULTIPOLYGON 4326)
protected_area          -- ООПТ: oopt_category, federal, area_m2, geometry MULTIPOLYGON
osm_road                -- лесные дороги: highway, name, geometry LINESTRING 4326

-- Наблюдения (VK)
observation             -- h3_index, species_id, observed_at, point, meta
region                  -- регионы: code, bbox, geometry

-- Газеттир (заготовка)
gazetteer_entry         -- топонимы с геометрией и типом
admin_area              -- административные районы Ленобласти
```

## Поток данных

```
ФГИС ЛК GeoJSON ──→ ingest_forest.py ──→ forest_polygon ──→ build_tiles.py ──→ forest.pmtiles
                                                 │
                                         forest_unified VIEW
                                                 │
                                     GET /api/forest/at?lat=&lon=
                                                 │
                                     MapLibre GL popup
                                   (бонитет, виды, сезон)

species_registry.yaml ──→ species + species_forest_affinity ──────────────────┘

VK-посты ──→ ingest_vk.py ──→ vk_post (с photo_species + district_admin_area_id)
                │
          Qwen 3.5 9B (LM Studio, qwen/qwen3.5-9b)
          подсчёт видов по фото; promotion в observation
          deprecated (CLAUDE.md «Deprecated»)
```

## Ключевые решения

### 1. PostGIS — единственный источник истины
Все данные в одной геобазе. Пространственные join'ы, транзакционность при переингесте, FK и CHECK-ограничения.

### 2. ForestSource абстракция
Каждый источник реализует `fetch() + normalize()`, пишет в общую `forest_polygon(source=...)`. `forest_unified` VIEW автоматически выбирает полигон с наивысшим приоритетом. Смена источника — одна SQL-миграция + перезапуск пайплайна.

### 3. PMTiles — без тайлового сервера
Один файл, HTTP Range requests. Браузер через PMTiles-библиотеку + MapLibre GL скачивает только нужные тайлы. API отдаёт файл через StaticFiles (FastAPI).

### 4. Bonitet/timber_stock/age_group в meta JSONB
Таксационные атрибуты хранятся в `meta JSONB` полигона, а не в отдельных колонках. API читает их при click-запросе и отдаёт в попап.

### 5. Типы леса (слаги) — стабильный контракт
`dominant_species` в `forest_polygon` использует тот же словарь, что `species_forest_affinity.forest_type`. Менять slug'и нельзя — только добавлять.

```
pine, spruce, larch, fir, cedar,
birch, aspen, alder, oak, linden, maple,
mixed_coniferous, mixed_broadleaved, mixed, unknown
```

### 6. H3 для агрегации наблюдений
Гексагональная сетка Uber resolution 7 (~5 км²). Observation хранит `h3_index`, агрегация «сколько раз в этой клетке нашли вид X» — один `GROUP BY`. Стабильно при расширении на новые регионы.

### 7. Гибридная карта — injection approach
Hybrid basemap реализован через:
1. `m.setStyle(SCHEME_STYLE_URL)` — загрузка Bright схемы
2. После `isStyleLoaded()` — добавление ESRI satellite raster как самого нижнего слоя
3. `setPaintProperty("background", "background-opacity", 0)` — прозрачный фон

Это надёжнее async fetch+modify, так как переиспользует тот же code path, что работает для "Схема".

## API endpoints

| Method | Path | Описание |
|--------|------|----------|
| GET    | `/api/forest/at?lat=&lon=`            | Полигон + теоретические виды по клику |
| GET    | `/api/soil/at?lat=&lon=`              | Почвенный полигон + ближайший разрез |
| GET    | `/api/water/distance/at?lat=&lon=`    | Расстояние до воды (3 источника, KNN) |
| GET    | `/api/terrain/at?lat=&lon=`           | DEM/slope/aspect (Copernicus GLO-30) |
| GET    | `/api/species/`                       | Каталог видов (для /species) |
| GET    | `/api/species/search?q=&limit=`       | Поиск грибов по имени |
| GET    | `/api/species/{slug}`                 | Полная карточка вида + forests + similars |
| GET    | `/api/regions/`                       | Список регионов |
| GET    | `/api/districts/`                     | Районы ЛО (admin_level=6) |
| GET    | `/api/stats/overview`                 | Общая сводка корпуса |
| GET    | `/api/stats/vk/species-now?window=14d`| Топ-виды за окно по VK-классификатору |
| GET    | `/api/auth/yandex/login`              | Старт OAuth-flow (Yandex ID + PKCE) |
| GET    | `/api/auth/yandex/callback`           | Завершение OAuth, выдача refresh-cookie |
| POST   | `/api/auth/refresh`                   | Rotate refresh -> новый access JWT |
| POST   | `/api/auth/logout`                    | Revoke refresh + clear cookie |
| GET    | `/api/user/me`                        | Профиль текущего юзера (Bearer) |
| GET    | `/api/cabinet/spots`                  | Свои сохранённые места (Bearer) |
| POST   | `/api/cabinet/spots`                  | Создать spot |
| PATCH  | `/api/cabinet/spots/{id}`             | Переименовать / изменить заметку / цвет |
| DELETE | `/api/cabinet/spots/{id}`             | Удалить spot |
| GET    | `/tiles/{filename}`                   | PMTiles файлы (StaticFiles, Range) |

## Источники лесных данных

| Источник | Priority | Покрытие | Статус |
|----------|----------|----------|--------|
| OSM (Overpass API) | 10 | Вся Ленобласть | ✅ 47 000 полигонов (88% unknown) |
| TerraNorte RLC | 45 | Россия | 📋 пайплайн готов, данные не загружены |
| Copernicus HRL | 50 | Европа | 📋 инфраструктура готова |
| Rosleshoz/ФГИСЛК | 60 | Запад + центр Ленобласти | ✅ 913 327 полигонов |

## Дальнейшие улучшения

- **Copernicus HRL**: остался как `ForestSource`-реализация с приоритетом 50, не используется (упёрлись в границу EEA39 — см. `docs/forest_sources_analysis.md`)
- **ООПТ**: скачать с oopt.aari.ru, инструкция в `docs/oopt_download.md`
- **Лесные дороги**: скачать PBF с Geofabrik, инструкция в `docs/osm_roads_download.md`
- **Болота**: OSM `natural=wetland` — аналогично водоохранным зонам
- **Тепловая карта H3**: данные `observation_h3_species_stats` уже есть в схеме
- **VK-наблюдения**: `pipelines/ingest_vk.py` готов, нужен VK_TOKEN + LM Studio
