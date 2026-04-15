# CONTEXT.md — Контекст проекта для AI-ассистентов

> Этот файл предназначен для AI-моделей (Claude, GPT, Gemini и др.) и будущих сессий.
> Читай его первым делом, прежде чем предлагать любые изменения.

---

## Исходные цели проекта

Владелец проекта (@yungkocherov) хочет создать **коммерчески жизнеспособный веб-сервис** — интерактивную грибную карту Ленинградской области с перспективой расширения на другие регионы России.

**Ключевые требования:**
1. Лесной слой на карте, раскрашенный по доминирующей породе деревьев
2. При клике на лес — попап с теоретическими и эмпирическими видами грибов
3. Дополнительные слои: водоохранные зоны, ООПТ, лесные дороги
4. Поиск по виду гриба и по географическому названию
5. Точность данных важнее скорости — заложить архитектуру под Rosleshoz/Copernicus
6. Масштабируемость: легко добавлять новые регионы и источники

---

## Текущее состояние (апрель 2026)

### Что работает ✅

| Компонент | Статус |
|-----------|--------|
| PostGIS схема (13 миграций) | ✅ готово |
| 913 327 полигонов Rosleshoz/ФГИСЛК (запад + центр Ленобласти) | ✅ загружено |
| 47 000 полигонов OSM Ленобласть (88% unknown) | ✅ загружено |
| PMTiles лесной слой (73.8 МБ) | ✅ сгенерировано |
| `forest_unified` VIEW — Rosleshoz + OSM с приоритетами | ✅ работает |
| FastAPI `/api/forest/at` с bonitet/timber_stock/age_group | ✅ работает |
| FastAPI `/api/species/search` — поиск грибов | ✅ работает |
| 24 вида грибов в справочнике с сезонами и съедобностью | ✅ загружено |
| PMTiles водоохранных зон (water.pmtiles) | ✅ сгенерировано |
| Водоохранные зоны в UI (тоггл-кнопка) | ✅ работает |
| Docker Compose (db + api + web) | ✅ работает |
| **4 подложки**: OSM, Схема, Спутник, Гибрид | ✅ готово |
| **3 режима раскраски леса**: порода / бонитет / возраст | ✅ готово |
| **Легенда** (адаптируется к режиму раскраски) | ✅ готово |
| **Сезонный фильтр** в попапе (чекбокс) | ✅ готово |
| **Поделиться точкой** (копировать ссылку) | ✅ готово |
| **Координаты под курсором** | ✅ готово |
| **Поиск по виду гриба** (+ фильтр на карте) | ✅ готово |
| **Поиск по месту** (Nominatim геокодер) | ✅ готово |
| URL sync (`?lat=&lon=&z=`) | ✅ готово |
| Попап: бонитет, запас м³/га, возрастная группа | ✅ готово |
| DB-таблица `water_zone` + пайплайны | ✅ готово |
| DB-таблицы `protected_area`, `osm_road` | ✅ схема готова |
| `ingest_oopt.py`, `build_oopt_tiles.py` | ✅ пайплайны готовы |
| `ingest_osm_roads.py`, `build_roads_tiles.py` | ✅ пайплайны готовы |
| ООПТ и дороги в UI | ✅ кнопки есть, проверяют наличие файла |

### Известные особенности

- **Windows: конфликт порта 5432** — docker-контейнер на **5434**. Пайплайны используют `DATABASE_URL=postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map`.
- **Vite + Docker + Windows**: hot-reload требует `watch: { usePolling: true, interval: 300 }` в `vite.config.ts` — уже настроено.
- **localhost → IPv6 на Windows**: прокси в `vite.config.ts` использует `http://127.0.0.1:8000`.
- **ООПТ и дороги**: PMTiles файлы (`oopt.pmtiles`, `roads.pmtiles`) ещё не сгенерированы — нет исходных данных. Кнопки показывают ошибку при нажатии.
- **Векторные подложки (схема/гибрид)** — CDN'ы ненадёжны для этого юзера: `tiles.openfreemap.org` рвёт соединение на glyph/sprite, `basemaps.cartocdn.com/rastertiles/voyager` возвращает 404, `tile.openstreetmap.de` не доступен. Рабочая комбинация:
  - **Схема**: Versatiles Colorful (`tiles.versatiles.org/assets/styles/colorful/style.json`) с in-app патчем: sprite-массив → строка (MapLibre 4.5 не поддерживает multi-sprite), все `text-size` × 1.6 для читаемости на retina (legacy `{stops: [...]}` формат обрабатывается отдельно от number/expression).
  - **Гибрид**: тот же Versatiles + инжект ESRI World_Imagery как bottom raster-layer, фильтрация слоёв до `line + symbol`.
  - **Fallback**: ESRI World_Topo_Map raster (для схемы) / ESRI World_Imagery + Reference labels (для гибрида).

### Что нужно сделать

| Задача | Приоритет |
|--------|-----------|
| Загрузить данные ООПТ → запустить `ingest_oopt.py` + `build_oopt_tiles.py` | Высокий |
| Загрузить OSM PBF дороги → запустить `ingest_osm_roads.py` + `build_roads_tiles.py` | Средний |
| Запустить VK-парсер (`ingest_vk.py`) | Средний |
| NER топонимов (Natasha) — `services/placenames/` готово, не запускалось | Средний |
| Bolota (OSM natural=wetland) | Низкий |
| Copernicus HRL Tree Species | Низкий |

---

## Архитектура

### База данных (PostGIS)

```sql
-- Ключевые таблицы:
forest_polygon          -- лесные полигоны (source, dominant_species, bonitet, timber_stock, age_group, geometry)
forest_source           -- источники (osm=10, copernicus=50, rosleshoz=60)
forest_unified          -- VIEW: выбирает полигон с наивысшим приоритетом
species                 -- справочник грибов (slug, name_ru, name_lat, edibility, season_months)
species_forest_affinity -- связь вид↔тип_леса (affinity 0..1)
water_zone              -- водоохранные зоны (geometry MULTIPOLYGON/POLYGON)
protected_area          -- ООПТ (oopt_category, federal, geometry)
osm_road                -- лесные дороги из OSM (highway, geometry LINESTRING)
observation             -- наблюдения из VK (h3_index, species_id, observed_at)
region                  -- регионы (bbox, name)
```

Миграции: `db/migrations/001..013_*.sql`

### Типы леса (слаги)

```
pine, spruce, larch, fir, cedar,
birch, aspen, alder, oak, linden, maple,
mixed_coniferous, mixed_broadleaved, mixed, unknown
```

### Источники лесных данных

| Источник | Приоритет | Статус |
|----------|-----------|--------|
| OSM (Overpass API) | 10 | ✅ 47 000 полигонов (88% unknown) |
| TerraNorte RLC | 45 | 📋 пайплайн готов, данные не загружены |
| Copernicus HRL | 50 | 📋 инфраструктура готова |
| Rosleshoz/ФГИСЛК | 60 | ✅ 913 327 полигонов (запад + центр Ленобласти, до 32.3°E) |

### Стек

- **Python 3.14** + FastAPI + psycopg3 + psycopg-pool + pydantic-settings
- **PostgreSQL 16 + PostGIS** в Docker
- **React 18 + TypeScript + Vite 5 + MapLibre GL JS**
- **PMTiles** — один файл, range-запросы, без тайлового сервера
- **H3 (Uber)** — гексагональная сетка для агрегации наблюдений (resolution 7, ~5 км²)
- **Natasha** — NER русских топонимов для VK-постов

---

## Структура репозитория

```
mushroom-map/
├── CONTEXT.md                  ← этот файл
├── .env.example                ← скопируй в .env
├── docker-compose.yml          ← PostGIS, api, web
├── Makefile
│
├── db/
│   ├── migrate.py
│   ├── migrations/             ← 001..013 SQL-миграции
│   └── seeds/
│       ├── regions.sql
│       ├── species_registry.yaml  ← 24 вида грибов
│       └── species_registry.sql
│
├── services/
│   ├── api/src/api/
│   │   ├── main.py
│   │   ├── db.py
│   │   ├── settings.py
│   │   └── routes/
│   │       ├── forest.py    ← GET /api/forest/at?lat=&lon= (bonitet, timber_stock, age_group)
│   │       ├── species.py   ← GET /api/species/search?q= + GET /api/species/{slug}/forests
│   │       ├── regions.py
│   │       └── tiles.py     ← StaticFiles /tiles/
│   │
│   ├── geodata/src/geodata/
│   │   ├── sources/
│   │   │   ├── base.py        ← ABC ForestSource
│   │   │   ├── osm.py
│   │   │   ├── copernicus.py  ← заглушка
│   │   │   └── rosleshoz/source.py  ← ФГИСЛК GeoJSON → forest_polygon
│   │   └── db.py              ← upsert_forest_polygons()
│   │
│   ├── placenames/             ← NER + газеттир (заготовка, не запускалось)
│   └── web/src/
│       ├── components/
│       │   ├── MapView.tsx     ← главный компонент карты
│       │   ├── MapControls.tsx ← плавающая панель (подложка + слои)
│       │   ├── Legend.tsx      ← легенда (адаптируется к режиму раскраски)
│       │   ├── SearchBar.tsx   ← поиск грибов + мест
│       │   └── Sidebar.tsx     ← заготовка
│       └── lib/
│           ├── api.ts          ← fetchForestAt, searchSpecies, searchPlaces
│           └── forestStyle.ts  ← цвета по типу леса, бонитету, возрасту
│
├── pipelines/
│   ├── build_tiles.py          ← forest → forest.pmtiles
│   ├── build_water_tiles.py    ← water_zone → water.pmtiles (с pre-projected temp table)
│   ├── build_oopt_tiles.py     ← protected_area → oopt.pmtiles
│   ├── build_roads_tiles.py    ← osm_road → roads.pmtiles
│   ├── fgislk_tiles_to_geojson.py  ← ФГИСЛК WMS tiles → GeoJSON
│   ├── ingest_forest.py        ← OSM → forest_polygon
│   ├── ingest_water_zones.py   ← ФГИСЛК water zones → water_zone
│   ├── ingest_oopt.py          ← GeoJSON → protected_area
│   ├── ingest_osm_roads.py     ← OSM PBF → osm_road
│   └── ingest_vk.py            ← VK-посты → observation (4 стадии)
│
└── docs/
    ├── overview.md
    ├── architecture.md
    ├── copernicus_migration.md
    ├── rosleshoz_download.md
    ├── oopt_download.md         ← инструкция по скачиванию ООПТ
    └── osm_roads_download.md    ← инструкция по скачиванию дорог из OSM
```

---

## Локальный запуск

### Предусловия

- Docker Desktop
- Python 3.14 (venv в `.venv/`)
- Node.js 24

### Запуск

```bash
# Все три сервиса
docker compose --profile full up -d

# Только база
docker compose up -d db

# Миграции (первый раз)
.venv/Scripts/python db/migrate.py
```

### Запуск API и фронта локально (без Docker)

```bash
docker compose up -d db

# API
cd services/api
"/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe" -m uvicorn api.main:app \
  --host 0.0.0.0 --port 8000 --reload

# Фронтенд
export PATH="/c/Program Files/nodejs:$PATH"
cd services/web && npm run dev
```

### Пайплайны (запускаются вручную)

```bash
# Пересобрать лесной PMTiles
python pipelines/build_tiles.py --region lenoblast \
  --dsn "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map"

# Водоохранные зоны (если не сгенерированы)
python pipelines/build_water_tiles.py \
  --dsn "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map"

# ООПТ (после загрузки данных из oopt.aari.ru)
python pipelines/ingest_oopt.py --file data/oopt/oopt.geojson \
  --dsn "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map"
python pipelines/build_oopt_tiles.py \
  --dsn "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map"

# Лесные дороги (после скачивания PBF из Geofabrik)
python pipelines/ingest_osm_roads.py --pbf data/osm/leningrad.osm.pbf \
  --dsn "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map"
python pipelines/build_roads_tiles.py \
  --dsn "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map"
```

---

## API

### GET /api/forest/at?lat=&lon=

```json
{
  "lat": 60.1, "lon": 30.5,
  "forest": {
    "dominant_species": "pine",
    "bonitet": 2,
    "timber_stock": 185.5,
    "age_group": "спелые",
    "source": "rosleshoz",
    "confidence": 0.9,
    "area_m2": 125000
  },
  "species_theoretical": [
    {
      "slug": "boletus_edulis",
      "name_ru": "Белый гриб",
      "name_lat": "Boletus edulis",
      "edibility": "edible",
      "season_months": [7, 8, 9],
      "affinity": 0.95
    }
  ],
  "species_empirical": []
}
```

### GET /api/species/search?q=белый&limit=5

```json
[
  {
    "slug": "boletus_edulis",
    "name_ru": "Белый гриб",
    "name_lat": "Boletus edulis",
    "edibility": "edible",
    "forest_types": ["pine", "spruce", "birch"]
  }
]
```

---

## Что НЕ нужно делать

- Не переносить на другой стек — архитектура выбрана осознанно
- Не добавлять Redux/MobX — приложение маленькое, useState достаточно
- Не mock-ать БД в тестах — реальный PostGIS обязателен
- Не трогать `forest_unified` VIEW без понимания системы приоритетов источников
- Не коммитить `data/tiles/` — файлы большие, регенерируются пайплайном
- Не использовать `conn.executemany()` в psycopg3 — нужно `cursor.executemany()`
- Не использовать `→` в print-строках — Windows cp1251 не поддерживает

---

## Контакты

- GitHub: https://github.com/yungkocherov/mushroom_map
- Владелец: @yungkocherov
