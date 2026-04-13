# mushroom-map

Интерактивная грибная карта Ленобласти (с перспективой расширения на другие регионы).

## Что это

Сервис-карта, на которой:
- леса раскрашены по доминирующей породе деревьев (хвойный / лиственный / смешанный, с детализацией)
- при наведении/клике показываются виды грибов, которые там встречаются — **эмпирически** (по упоминаниям в региональных ВК-группах) и **теоретически** (по справочнику «вид ↔ тип леса»)
- есть фильтры по сезону, виду, году

## Архитектура

Модульный монорепозиторий. Сервисы общаются через общую БД (Postgres + PostGIS) и HTTP-API.

```
mushroom-map/
├── db/                         # миграции PostGIS и сиды
├── services/
│   ├── geodata/                # загрузка и нормализация лесных данных
│   │                           # (OSM сейчас, Copernicus потом) + генерация тайлов
│   ├── placenames/             # NER топонимов + газеттир + геокодирование
│   ├── species_registry/       # справочник видов грибов и их связь с лесами
│   ├── api/                    # FastAPI: эндпоинты для фронта
│   └── web/                    # React + Vite + MapLibre GL (фронт)
├── pipelines/                  # шаги ETL: ingest_vk, ingest_forest, extract_places, build_tiles
└── docs/
    ├── architecture.md
    └── copernicus_migration.md # как перейти с OSM на Copernicus
```

Подробнее см. [docs/architecture.md](docs/architecture.md).

## Стек

- **Postgres 16 + PostGIS** — хранилище (в Docker)
- **Python 3.11 + FastAPI** — бэкенд
- **Natasha** — NER русских топонимов
- **H3 (Uber)** — пространственная сетка для агрегации
- **React + TypeScript + Vite + MapLibre GL JS** — фронтенд
- **Tippecanoe + PMTiles** — векторные тайлы для лесного слоя
- **Docker Compose** — локальная среда

## Быстрый старт (пока заглушка)

```bash
cp .env.example .env
docker compose up -d db
# миграции
make db-migrate
# сиды
make db-seed
# api
make api-dev
# фронт
make web-dev
```

## Статус

Фаза 1 (MVP для Ленобласти) — в разработке.

## Лицензия

TBD
