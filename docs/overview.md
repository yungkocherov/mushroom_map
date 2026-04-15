# Обзор проекта mushroom-map

Это обзор для человека, который открывает репозиторий впервые.

Если нужна детальная техничка для AI-ассистента — читай [CONTEXT.md](../CONTEXT.md).
Если нужна архитектура БД и API — [architecture.md](architecture.md).

---

## 1. Что это такое

**Mushroom-map** — веб-сервис «грибная карта Ленинградской области».

Открываешь сайт, видишь карту, где леса раскрашены по породе деревьев (сосна, ель, берёза…). Тыкаешь в лес — попап с видами грибов для этого типа леса, бонитетом, запасом древесины и возрастной группой.

Четыре подложки: OSM, Схема (OpenFreeMap), Спутник (ESRI), Гибрид. Поиск по виду гриба (фильтрует лесной слой) и по географическому названию (Nominatim). Слои: водоохранные зоны, ООПТ, лесные дороги.

---

## 2. Как устроен поток данных

```
ФГИС ЛК (Rosleshoz GeoJSON)
         │
         ▼
  ingest_forest.py  ──→  forest_polygon (PostGIS)
                                 │
                          build_tiles.py
                                 │
                          forest.pmtiles  ──→  браузер (MapLibre GL)

ФГИС ЛК (водоохранные зоны)
         │
         ▼
  ingest_water_zones.py ──→ water_zone ──→ build_water_tiles.py ──→ water.pmtiles

species_registry.yaml ──→ species + species_forest_affinity ──→ GET /api/forest/at

VK-посты ──→ ingest_vk.py ──→ observation ──→ попап (эмпирика, пока пустой)
```

---

## 3. Что в каких папках

```
mushroom-map/
├── CONTEXT.md              ← техничка для AI, актуальный статус
├── db/
│   ├── migrate.py          ← запускает миграции 001..013
│   ├── migrations/         ← SQL-структура всех таблиц
│   └── seeds/
│       └── species_registry.yaml  ← 24 вида грибов с афинностью к типам леса
│
├── services/
│   ├── api/                ← FastAPI бэкенд
│   │   └── src/api/routes/
│   │       ├── forest.py   ← GET /api/forest/at  (главный endpoint)
│   │       ├── species.py  ← GET /api/species/search
│   │       └── tiles.py    ← отдаёт PMTiles файлы
│   │
│   ├── geodata/            ← нормализация лесных данных (ForestSource абстракция)
│   │   └── sources/rosleshoz/source.py  ← ФГИС ЛК GeoJSON → NormalizedForestPolygon
│   │
│   └── web/src/
│       ├── components/
│       │   ├── MapView.tsx     ← вся логика карты (800 строк)
│       │   ├── MapControls.tsx ← панель подложки + слоёв
│       │   ├── Legend.tsx      ← легенда (меняется по режиму раскраски)
│       │   └── SearchBar.tsx   ← поиск грибов + мест
│       └── lib/
│           ├── api.ts          ← fetchForestAt, searchSpecies, searchPlaces
│           └── forestStyle.ts  ← цвета и режимы раскраски леса
│
├── pipelines/
│   ├── ingest_forest.py        ← основной пайплайн леса (OSM / Rosleshoz)
│   ├── build_tiles.py          ← forest.pmtiles
│   ├── ingest_water_zones.py   ← water_zone
│   ├── build_water_tiles.py    ← water.pmtiles (быстро, ~30 сек)
│   ├── ingest_oopt.py          ← protected_area (нужны данные)
│   ├── build_oopt_tiles.py     ← oopt.pmtiles
│   ├── ingest_osm_roads.py     ← osm_road из PBF (нужны данные)
│   └── build_roads_tiles.py    ← roads.pmtiles
│
└── docs/
    ├── architecture.md         ← детали БД и API
    ├── rosleshoz_download.md   ← как скачать ФГИС ЛК данные
    ├── oopt_download.md        ← как скачать ООПТ
    ├── osm_roads_download.md   ← как скачать OSM PBF дороги
    └── copernicus_migration.md ← план перехода на Copernicus HRL
```

---

## 4. Основные команды

```bash
# Поднять всё
docker compose --profile full up -d

# Только БД (для локальной разработки)
docker compose up -d db

# Миграции (первый раз)
.venv/Scripts/python db/migrate.py

# Пересобрать лесные тайлы после реингеста
python pipelines/build_tiles.py --region lenoblast \
  --dsn "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map"

# Загрузить ООПТ (после скачивания GeoJSON)
python pipelines/ingest_oopt.py --file data/oopt/oopt.geojson \
  --dsn "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map"
python pipelines/build_oopt_tiles.py \
  --dsn "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map"
```

---

## 5. Текущий статус

### Работает ✅
- 111 559 лесных полигонов Rosleshoz (Карельский перешеек) + 47 000 OSM
- PMTiles лесного слоя (73.8 МБ) и водоохранных зон
- Попап с бонитетом, запасом, возрастной группой, видами грибов
- Поиск по виду (фильтр на карте) и по месту
- 4 подложки, 3 режима раскраски, легенда, сезонный фильтр в попапе
- Кнопки ООПТ и дорог (показывают ошибку если данные не загружены)

### Нужны данные / запуск пайплайнов ⏳
- ООПТ: скачать с oopt.aari.ru → `ingest_oopt.py` + `build_oopt_tiles.py`
- Лесные дороги: скачать PBF с Geofabrik → `ingest_osm_roads.py` + `build_roads_tiles.py`
- VK-наблюдения: нужен VK_TOKEN + LM Studio с Gemma для фото-классификации

---

## 6. Если что-то пошло не так

- **Порт 5432 занят** — в `.env` и пайплайнах используется порт 5434
- **`localhost` → IPv6** — прокси в `vite.config.ts` написан на `127.0.0.1`, не меняй
- **Vite не видит изменений** — нужен `usePolling: true` в `vite.config.ts` (уже есть)
- **PMTiles не грузится** — проверь `TILES_DIR` в `services/api/.env`
- **ООПТ/дороги 404** — тайлы ещё не сгенерированы, запусти пайплайны
