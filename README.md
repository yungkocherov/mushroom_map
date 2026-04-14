# mushroom-map

Интерактивная грибная карта Ленинградской области.

## Что это

Веб-сервис, на котором:
- леса Карельского перешейка раскрашены по данным Rosleshoz/ФГИСЛК (порода, бонитет, возрастная группа)
- при клике на полигон — попап с теоретическими видами грибов (по справочнику «вид ↔ тип леса») и эмпирическими (из VK-групп)
- наложение водоохранных зон, ООПТ и лесных дорог
- поиск по виду гриба и по месту (геокодер)
- сезонный фильтр видов в попапе

## Стек

- **PostgreSQL 16 + PostGIS** — хранилище (Docker)
- **Python 3.14 + FastAPI + psycopg3** — бэкенд
- **React 18 + TypeScript + Vite 5 + MapLibre GL JS** — фронтенд
- **PMTiles** — векторные тайлы (range-запросы, без тайлового сервера)
- **Tippecanoe** — генерация PMTiles из PostGIS
- **Docker Compose** — локальная среда (db + api + web)

## Архитектура

```
mushroom-map/
├── db/                     # миграции PostGIS (001..013) + сиды
├── services/
│   ├── geodata/            # ForestSource абстракция (OSM, Copernicus, Rosleshoz)
│   ├── placenames/         # NER топонимов (Natasha) + газеттир
│   ├── species_registry/   # справочник видов (yaml → sql)
│   ├── api/                # FastAPI: /api/forest/at, /api/species/search, /tiles/
│   └── web/                # React + MapLibre GL
├── pipelines/              # ETL-скрипты (ingest_*, build_*_tiles)
└── docs/
```

Подробнее — [docs/architecture.md](docs/architecture.md).

## Быстрый старт

```bash
# Поднять все сервисы (db + api + web)
docker compose --profile full up -d

# Только база (для локальной разработки)
docker compose up -d db

# Миграции
.venv/Scripts/python db/migrate.py

# Карта доступна на http://localhost:5173
```

## Данные

| Слой | Источник | Статус |
|------|----------|--------|
| Лесные полигоны | Rosleshoz/ФГИСЛК | ✅ 111 559 полигонов (Карельский перешеек) |
| Лесные полигоны | OSM | ✅ 47 000 полигонов (88% unknown) |
| Водоохранные зоны | Rosleshoz/ФГИСЛК | ✅ загружены, PMTiles готов |
| ООПТ | oopt.aari.ru | 📋 пайплайн готов, данные не загружены |
| Лесные дороги | OSM PBF | 📋 пайплайн готов, данные не загружены |
| Виды грибов (справочник) | вручную | ✅ 24 вида |
| Наблюдения (VK) | ВК-группы | 📋 парсер готов, прогона не было |

## Лицензия

TBD
