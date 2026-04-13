# CONTEXT.md — Контекст проекта для AI-ассистентов

> Этот файл предназначен для AI-моделей (Claude, GPT, Gemini и др.) и будущих сессий.
> Читай его первым делом, прежде чем предлагать любые изменения.

---

## Исходные цели проекта

Владелец проекта (@yungkocherov) хочет создать **коммерчески жизнеспособный веб-сервис** — интерактивную грибную карту Ленинградской области с перспективой расширения на другие регионы России.

**Ключевые требования, сформулированные в начале:**
1. Лесной слой на карте, раскрашенный по доминирующей породе деревьев (сосна, ель, берёза и т.д.)
2. При клике на лес — попап с двумя списками грибов:
   - **Теоретические** — из базы знаний «вид ↔ тип леса» (справочник)
   - **Эмпирические** — из постов ВК-групп типа «Грибники Ленобласти» (реальные наблюдения)
3. Фильтры по сезону, виду, году
4. Точность данных важнее скорости — заложить архитектуру под Copernicus HRL Tree Species (10м спутниковые данные) с самого начала
5. Масштабируемость: легко добавлять новые регионы, источники данных
6. Потенциальная монетизация (подписка, B2B API, партнёрства)

---

## Текущее состояние (апрель 2026)

### Что уже работает ✅

| Компонент | Статус |
|-----------|--------|
| PostGIS схема (6 миграций) | ✅ готово |
| 47 000 лесных полигонов Ленобласти из OSM | ✅ загружено |
| PMTiles (54 МБ) — векторные тайлы лесного слоя | ✅ генерируется |
| FastAPI backend `/api/forest/at` | ✅ работает |
| 24 вида грибов в справочнике с сезонами и съедобностью | ✅ загружено |
| Теоретические виды в попапе (афинность к типу леса) | ✅ работает |
| React + MapLibre GL фронтенд с лесным слоем | ✅ работает |
| PMTiles отдаётся через FastAPI StaticFiles | ✅ работает |
| Клик на полигон → попап с названием леса + список грибов | ✅ работает |
| Docker Compose — все три контейнера (db, api, web) | ✅ работает |
| Векторный стиль базовой карты (OpenFreeMap Bright) | ✅ чёткие надписи |

### Известные баги и решения ⚠️

- **88% полигонов имеют тип `unknown`** (серые на карте) — в OSM Россия почти не имеет тегов `wood=`/`leaf_type=`. Виды грибов для `unknown` добавлены в БД, попап работает. Долгосрочное решение: Copernicus HRL (см. `docs/copernicus_migration.md`).
- **Windows: `localhost` → IPv6** — Node.js 18+ резолвит `localhost` в `::1`, а Docker публикует на IPv4. В `vite.config.ts` прокси настроен на `http://127.0.0.1:8000`. **Не менять на `localhost`**.
- **PMTiles Range-запросы через Vite** — решено в `vite.config.ts` (правильный target + Range-заголовки). В `MapView.tsx` также прописан прямой URL к API как fallback.

### Что НЕ сделано ❌

| Задача | Приоритет | Описание |
|--------|-----------|----------|
| Эмпирические виды в попапе | Высокий | `species_empirical: []` — всегда пустой массив |
| Импорт VK-постов | Высокий | Парсер есть в `~/ik_mushrooms_parser/`, нужно адаптировать |
| NER топонимов (Natasha) | Высокий | `services/placenames/` — заготовка, не запускалась |
| Газеттир Ленобласти | Высокий | `db/migrations/006_gazetteer.sql` — таблица есть, данных нет |
| H3-агрегация наблюдений | Средний | `db/migrations/005_observations.sql` — схема готова |
| Фильтры в UI (сезон, вид) | Средний | Sidebar есть как компонент, логика не подключена |
| Легенда (кликабельная) | Низкий | `components/Legend.tsx` — отображает цвета, клик не работает |
| Мобильная вёрстка | Низкий | Не тестировалась |
| Copernicus миграция | Высокий для точности | Описана в `docs/copernicus_migration.md` |

### Приоритет следующих шагов

1. **Эмпирические виды** — VK-парсер → observation → H3 → попап
2. **Классификация лесов** — эвристика OSM или Copernicus
3. **UI** — фильтры сезон/съедобность, кликабельная легенда

---

## Архитектура и ключевые решения

### База данных (PostGIS)

```sql
-- Ключевые таблицы:
forest_polygon          -- лесные полигоны (source, dominant_species, geometry MULTIPOLYGON)
forest_source           -- источники данных с приоритетами (osm=10, copernicus=50)
forest_unified          -- VIEW: выбирает полигон с наивысшим приоритетом источника
species                 -- справочник грибов (slug, name_ru, name_lat, edibility, season_months)
species_forest_affinity -- связь вид↔тип_леса (affinity 0..1)
observation             -- наблюдение из VK-поста (h3_index, species_id, observed_at)
gazetteer               -- топонимы Ленобласти с геометрией
region                  -- регионы (bbox, name)
```

**Переход на Copernicus = одна SQL-миграция + перезапуск пайплайна**, без изменений API и фронтенда. Это было заложено намеренно.

### Типы леса (слаги)

Единый словарь синхронизирован между Python, БД и TypeScript:
```
pine, spruce, larch, fir, cedar,
birch, aspen, alder, oak, linden, maple,
mixed_coniferous, mixed_broadleaved, mixed, unknown
```

### Источники данных

| Источник | Приоритет | Статус |
|----------|-----------|--------|
| OSM (Overpass API) | 10 | ✅ загружен |
| Rosleshoz | 40 | ❌ не реализован |
| Copernicus HRL | 50 | ❌ заглушка (`sources/copernicus.py`) |

### Стек

- **Python 3.14** + FastAPI + psycopg3 + psycopg-pool + pydantic-settings
- **PostgreSQL 16 + PostGIS** в Docker
- **React 18 + TypeScript + Vite 5 + MapLibre GL JS**
- **PMTiles** — формат векторных тайлов (один файл, range-запросы)
- **H3 (Uber)** — гексагональная сетка для агрегации наблюдений (resolution 7, ~5 км²)
- **Natasha** — NER русских топонимов для извлечения мест из VK-постов

---

## Структура репозитория

```
mushroom-map/
├── CONTEXT.md                  ← этот файл
├── .env.example                ← скопируй в .env
├── docker-compose.yml          ← PostGIS, api, web
├── Makefile                    ← все команды разработки
│
├── db/
│   ├── migrate.py              ← запускает миграции по порядку
│   ├── migrations/             ← 001..006 SQL-миграции
│   └── seeds/
│       ├── regions.sql         ← Ленобласть + СПб
│       ├── species_registry.yaml  ← 24 вида грибов
│       └── species_registry.sql   ← сгенерировано из yaml
│
├── services/
│   ├── api/                    ← FastAPI бэкенд
│   │   └── src/api/
│   │       ├── main.py         ← lifespan, CORS, StaticFiles /tiles
│   │       ├── db.py           ← psycopg ConnectionPool
│   │       ├── settings.py     ← TILES_DIR, DATABASE_URL и др.
│   │       └── routes/
│   │           ├── forest.py   ← GET /api/forest/at?lat=&lon=
│   │           ├── species.py
│   │           ├── regions.py
│   │           └── tiles.py
│   │
│   ├── geodata/                ← загрузка и нормализация лесных данных
│   │   └── src/geodata/
│   │       ├── sources/
│   │       │   ├── base.py     ← ABC ForestSource
│   │       │   ├── osm.py      ← Overpass API + shapely
│   │       │   └── copernicus.py ← заглушка
│   │       ├── db.py           ← upsert_forest_polygons()
│   │       └── types.py        ← NormalizedForestPolygon, ForestTypeSlug
│   │
│   ├── species_registry/       ← загрузка справочника видов из YAML
│   ├── placenames/             ← NER + газеттир (заготовка)
│   └── web/                    ← React фронтенд
│       └── src/
│           ├── components/
│           │   ├── MapView.tsx ← главный компонент карты
│           │   ├── Sidebar.tsx
│           │   └── Legend.tsx
│           └── lib/
│               ├── api.ts      ← fetchForestAt()
│               └── forestStyle.ts ← цвета по типу леса
│
├── pipelines/
│   ├── ingest_forest.py        ← OSM → forest_polygon
│   ├── build_tiles.py          ← forest_polygon → PMTiles
│   ├── ingest_vk.py            ← VK-посты → observation (заготовка)
│   └── extract_places.py       ← NER топонимов → gazetteer (заготовка)
│
└── docs/
    ├── architecture.md
    └── copernicus_migration.md ← пошаговый план перехода на Copernicus
```

---

## Локальный запуск

### Предусловия

- Docker Desktop (для PostGIS)
- Python 3.14 (venv в `.venv/`)
- Node.js 24 (`C:\Program Files\nodejs\` на машине разработчика)

### Запуск (Docker Compose — рекомендуется)

```bash
# Поднять все три сервиса (db + api + web)
docker compose --profile full up -d

# Только база (для локальной разработки api/web)
docker compose up -d db
```

### Запуск локально (без Docker для api/web)

```bash
# База через Docker
docker compose up -d db

# API (venv в .venv/, создан из python 3.14)
cd services/api
"/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe" -m uvicorn api.main:app \
  --host 0.0.0.0 --port 8000 --reload

# Фронтенд (Node PATH нужен в bash)
export PATH="/c/Program Files/nodejs:$PATH"
cd services/web && npm run dev
```

### Важные особенности Windows

- **`localhost` → IPv6 на Windows**: Node.js 18+ резолвит `localhost` в `::1`, а uvicorn слушает IPv4. В `vite.config.ts` прокси настроен на `http://127.0.0.1:8000` (не `localhost`). Не меняй на `localhost` — сломается.
- **PMTiles range-запросы**: PMTiles делает HTTP Range requests. Vite proxy их поддерживает при правильном target. Конфиг уже настроен.
- **TILES_DIR**: в `services/api/.env` прописан `TILES_DIR=../../data/tiles`. Не удаляй.

---

## Следующие шаги (в порядке приоритета)

### 1. Эмпирические виды — подключить VK-данные

Старый парсер ВК есть в `~/ik_mushrooms_parser/`. Нужно:
- Адаптировать его под схему `observation` (см. `db/migrations/005_observations.sql`)
- Запустить `pipelines/ingest_vk.py`
- Заполнить `gazetteer` топонимами Ленобласти
- Запустить `pipelines/extract_places.py` (NER через Natasha)
- Создать материализованное представление `observation_h3_species_stats`
- Подключить в `GET /api/forest/at` — заполнить `species_empirical`

### 2. Улучшить классификацию лесов

88% полигонов — `unknown`. Два варианта:
- **Быстро**: обогатить OSM-данные эвристикой (название содержит "бор", "ельник" и т.д.)
- **Правильно**: Copernicus HRL Tree Species — инструкция в `docs/copernicus_migration.md`

### 3. UI/UX

- Sidebar: фильтры по сезону (текущий месяц выделен), виду, съедобности
- Legend: клик на цвет → фильтрует карту по типу леса
- Мобильная вёрстка

### 4. Качество карты

- Базовая карта: сейчас OpenFreeMap Bright (векторный стиль, бесплатно)
- Если хочется русские подписи лучше — рассмотреть 2GIS Maps API

---

## Структура данных попапа (API response)

```json
GET /api/forest/at?lat=60.1&lon=30.5
{
  "lat": 60.1,
  "lon": 30.5,
  "forest": {
    "dominant_species": "pine",
    "species_composition": {"pine": 0.7, "birch": 0.3},
    "source": "osm",
    "confidence": 0.7,
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
  "species_empirical": []   // ← пока пустой, см. задачу #1
}
```

---

## Что НЕ нужно делать

- Не переносить на другой стек — архитектура выбрана осознанно
- Не добавлять Redux/MobX — приложение маленькое, useState достаточно
- Не mock-ать БД в тестах — реальный PostGIS обязателен
- Не трогать `forest_unified` VIEW без понимания системы приоритетов источников
- Не коммитить `data/tiles/` — файлы большие, регенерируются пайплайном

---

## Контакты и ссылки

- GitHub: https://github.com/yungkocherov/mushroom_map
- Владелец: @yungkocherov
