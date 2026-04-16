# mushroom-map

Интерактивная грибная карта Ленинградской области.

## Что это

Веб-сервис, на котором:
- леса всей Ленобласти раскрашены по данным Rosleshoz/ФГИСЛК (~2M полигонов: порода, бонитет, возрастная группа)
- при клике на полигон — попап с теоретическими видами грибов (по справочнику «вид ↔ тип леса»)
- 7 слоёв: леса, водоохранные зоны, ООПТ, лесные дороги, болота, вырубки, защитные леса
- подписи населённых пунктов из OSM (7k точек)
- поиск по виду гриба и по месту (геокодер)
- 4 подложки: OSM / Схема / Спутник / Гибрид
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
├── db/                     # миграции PostGIS (001..016) + сиды
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
| Лесные полигоны | Rosleshoz/ФГИСЛК | ✅ ~2M полигонов (вся Ленобласть 27.8–36.0°E), PMTiles 496 MB |
| Лесные полигоны | OSM | ✅ 47 000 полигонов (88% unknown, перекрыты Rosleshoz) |
| Водоохранные зоны | Rosleshoz/ФГИСЛК | ✅ PMTiles 6 MB |
| ООПТ | OSM (Overpass) | ✅ 419 полигонов, PMTiles 1.2 MB |
| Лесные дороги | OSM (Overpass) | ✅ 318 884 линии, PMTiles 31 MB |
| Болота | OSM (Overpass) | ✅ 34 177 полигонов, PMTiles 20 MB |
| Вырубки и гари | ФГИСЛК | ✅ 1 270 полигонов, PMTiles 6 MB |
| Защитные леса | ФГИСЛК | ✅ 598 полигонов, PMTiles 14 MB |
| Населённые пункты | OSM (Overpass) | ✅ 7 116 точек, GeoJSON 1.2 MB |
| Виды грибов (справочник) | вручную | ✅ 24 вида |
| Наблюдения (VK) | ВК-группы | 📋 парсер готов, прогона не было |

## Лицензия

TBD
