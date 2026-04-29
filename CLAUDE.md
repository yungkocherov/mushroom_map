# CLAUDE.md — project context for Claude Code sessions

This file is auto-loaded at the start of every session. It contains the
durable conventions, commands, and known gotchas. For architecture see
`docs/architecture.md`; for the active **redesign 2026-04 spec** see
**`docs/redesign-2026-04.md`** (planner-first IA, map-as-home, 3-phase
rollout — phases 1 done, phase 2 in progress); for roadmap see
`docs/roadmap_content_ideas.md`; for why we ended up with Rosleshoz see
`docs/forest_sources_analysis.md`.

**Brand:** the project is being renamed `mushroom-map` → **Geobiom**
(Title Case in prose/UI/OG, lowercase `geobiom` in URL/files; wordmark
may use lowercase). Domain `geobiom.ru` is author-owned, parked at
Cloudflare. The repo name and npm-workspace names (`@mushroom-map/*`)
will rename in a later phase.

**Sibling repo `mushroom-forecast`** живёт в `C:\Users\ikoch\mushroom-forecast`
(GitHub: yungkocherov/mushroom-forecast, private). Он владеет схемой
`forecast.*` в этой же Postgres-базе. mushroom-map **только читает**
`forecast.prediction` (будущий `/api/forecast/at`). В public.* из
forecast-репо не пишем — это двусторонний контракт.

## Iteration workflow — ОБЯЗАТЕЛЬНО в конце каждой итерации

Чтобы любая новая сессия могла за 30 секунд понять «что сделано / что
следующее», **не закрывай итерацию без**: (1) commit + push в origin,
(2) апдейт `Iter-N status` / `Next up` секций этого файла, (3) апдейт
memory-файлов (`MEMORY.md` + relevant `reference_*.md`), (4) фиксация
exit-state в активном plan-файле если он был. Полная версия правила —
в `mushroom-forecast/CLAUDE.md`, этот репо следует тому же протоколу.

## One-line summary

Interactive forest+forage map for Leningrad Oblast (rebranded to
**Geobiom**, prod live на `geobiom.ru`). PostGIS + FastAPI + React +
MapLibre GL + PMTiles + Zustand. Forest polygons from Rosleshoz/ФГИСЛК
(~2M, full LoO coverage), painted by dominant tree species / bonitet /
age group; click → popup with bonitet/age + fungi theoretical from
species registry. Home (`/`) = карта c collapsible sidebar.

## IA & key routes (post-redesign 2026-04)

```
/                        → map-as-home (MapHomePage = Sidebar + MapView)
                           Sidebar collapsible (persist localStorage);
                           карта читает grid-column:2 явно — иначе при
                           display:none sidebar'а MapPane уезжал в 0px
                           колонку (баг найден 2026-04-28).
/map                     → 301 → /
/map/:district           → district detail (SidebarDistrict)
/species                 → catalog
/species/:slug           → species detail (без CTA «Открыть на карте» —
                           справочник, не точка входа в карту)
/spots                   → «Сохранённые места» (auth-gated). URL ASCII;
                           UI labels — «Сохранённые места» (header),
                           «Сохранённые» (LayerGrid чип, узкий).
/cabinet/spots           → 301 → /spots
/methodology             → hub (данные / модель / проект / legal)
/methodology/:slug       → MDX article
/about                   → 301 → /methodology/about
/guide                   → 301 → /methodology
/legal/{privacy,terms}   → live
/auth/*                  → Yandex OAuth flow
```

**District choropleth удалён 2026-04-28.** Раскраска по 18 районам
отражала бы географию VK-постов, а не реальное распределение грибов.
Удалены `forecast-choropleth-fill` слой, top-5 список в SidebarOverview,
choropleth-controller useEffect в MapView. `forecastChoropleth.ts`
файл и ключ в `useLayerVisibility` оставлены (выключен) на случай
возврата при появлении точечной forecast-модели.

**user_spot.tags TEXT[]** (миграция 029, 2026-04-28) + **user_spot.rating
SMALLINT 1-5** (миграция 030, 2026-04-29 — заменила старый `color` enum).
Tags: multi-select из словаря `apps/web/src/lib/spotTags.ts` — 11 пород
деревьев + 13 видов грибов + 5 ягод. Slug'и совпадают с
`species_forest_affinity` где возможно (boletus-edulis...) — задел на
матчинг с моделью прогноза. SaveSpotModal + SpotDetailPage edit рисуют
чип-блоки «Деревья / Грибы / Ягоды». Сервер только дедуп+trim, без
word-list валидации — словарь во фронте.

Rating: оценка качества места 1..5 (1=плохое → 5=отличное). Цвет маркера
производный от rating через `apps/web/src/lib/spotRating.ts`
(red→orange→grey→green→dark-green). Pydantic Field(ge=1, le=5) +
CHECK constraint синхронизированы. Старые color-значения backfill'ятся
в миграции (forest/chanterelle→4, moss/birch→3, danger→1).

Global UI primitives:
- **Spotlight (⌘K)** — `apps/web/src/components/Spotlight.tsx`. Mounted in
  `Layout`. Хитит `/api/species/search` + `/api/places/search`
  (`searchGazetteer`). Без cmdk — на Radix Dialog.
- **BottomSheet** — `apps/web/src/components/mobile/BottomSheet.tsx`.
  3 snap (peek 18% / half 55% / full 92%), `@use-gesture/react` +
  `@react-spring/web`. Stand-alone primitive; интеграция с MapLibre popup
  на ≤768px пойдёт следующим шагом.
- **LayerGrid** — `apps/web/src/components/mapView/LayerGrid.tsx`. После
  rеfactor'а 2026-04-29 расширен до primary 7 chip'ов (Прогноз/Породы/
  Бонитет/Возраст/Почва/Рельеф/Споты) + secondary 8 chip'ов под disclosure
  «Ещё слои» (Водотоки/Болота/Водоохранные/ООПТ/Дороги/Вырубки/Защитные/
  Районы). `floating?` prop оборачивает в `position:absolute` для
  использования внутри MapView как floating-панель; в Sidebar — без prop'а.
  Рендерится в трёх местах: SidebarOverview, SidebarDistrict, MapView (top-right
  floating). Все три синхронизированы через `useLayerVisibility` store.
- **Per-page `<title>` / meta-description** — `useLayerTitle` hook в
  `apps/web/src/lib/usePageTitle.ts`. Подключён к /species, /species/:slug,
  /spots, /methodology, /methodology/:slug.

Methodology articles живут как MDX в `apps/web/src/content/methodology/`:
forest-data, vk-pipeline, species-registry — рубрика «Источники данных»;
about, authors, changelog — «О проекте». Frontmatter содержит `category`
(см. `index.ts:METHODOLOGY_CATEGORIES`).

Hero photo manifest scaffold: `apps/web/src/content/photos.json` (TODO в
`apps/web/src/content/photos-candidates.md`). До наполнения карточки
`/species/:slug` рисуют диагональный паттерн `birch` в hero.

State for the map sub-app lives in three Zustand stores:
- `apps/web/src/store/useLayerVisibility.ts` — 13 layer keys + forestColorMode
- `apps/web/src/store/useMapMode.ts` — `'overview' | 'district'` + selected district
- `apps/web/src/store/useForecastDate.ts` — date scrubber state
- `apps/web/src/store/useForecastDistricts.ts` — cached fetch hook for `/api/forecast/districts`

## Environment quirks — read this first

- **Python venv**: `/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe`
  (Python 3.14). Never just `python` — it runs system Python without deps.
- **Node**: `/c/Program Files/nodejs/` is not on PATH by default in bash.
  Before any `npm` / `npx` command:
  `export PATH="/c/Program Files/nodejs:$PATH"`
- **Postgres port**: host port **5434** (not 5432). Native Windows Postgres
  squats on 5432. Pipelines use `DATABASE_URL=postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map`.
  API container talks to `db:5432` via the compose network — that's fine.
- **Vite proxy target is `127.0.0.1:8000`**, not `localhost:8000`.
  Node 18+ resolves localhost → IPv6 first, uvicorn listens on IPv4.
  Do NOT "fix" this.
- **Windows cp1251 encoding**: don't put `→`, `←`, Unicode arrows in
  `print()` calls — Python crashes with UnicodeEncodeError when redirected.
  Use `->` / `<-`.
- **psycopg3 is `cursor.executemany()`**, not `conn.executemany()`. The
  latter silently works on psycopg2 but errors on psycopg3.
- **psycopg3 strict-parses `%` even in SQL comments and string literals.**
  Любой одиночный `%` в строке → `incomplete placeholder` error. Typical
  trap: комментарий типа `-- дубли на 1-2% площади` или print(f"{x}%").
  Решение: экранировать `%%`, или вообще избегать `%` в SQL-строках. Актуально
  для SQL, который передаётся как Python f-string / literal с параметрами.
- **Vite HMR on Docker + Windows needs polling**: `vite.config.ts` has
  `watch: { usePolling: true, interval: 300 }`. If file changes don't
  reload, verify that config is intact.
- **Web dev запускается на хосте, не в docker** (с Phase 1 D3). Docker
  Desktop + WSL2 + virtiofs на Windows ловит esbuild `Cannot read
  directory ".": cannot allocate memory` при bind-mount workspace-репо.
  Поэтому service `web` теперь в профиле `full-web` и НЕ поднимается
  через `docker compose --profile full up -d`. Dev-loop:
  ```
  export PATH="/c/Program Files/nodejs:$PATH"
  npm run dev              # из репо-root: vite workspace @mushroom-map/web
  ```
  Контейнер `web` всё ещё билдится (`docker compose --profile full-web
  build web`) для прод-проверки. Dockerfile обновлён под workspaces:
  copy root + packages/* package.json, `npm ci --workspaces
  --include-workspace-root`, WORKDIR /workspace/apps/web. Когда ставишь
  host-side новый npm-пакет: `npm install --workspace=@mushroom-map/web
  <pkg>` из репо-root.
- **PMTiles Range requests** go direct to API (`http://${API_ORIGIN}/tiles/...`),
  not through Vite proxy. Vite proxy doesn't handle Range well.

## Common commands

```bash
# Bring up backend stack (db + api). Web фронт запускается на хосте
# отдельно через `npm run dev` (см. Environment quirks).
docker compose --profile full up -d

# DB only (для API/web разработки без докеризированного API)
docker compose up -d db

# Фронт — hot-reload Vite на хосте
export PATH="/c/Program Files/nodejs:$PATH"
npm run dev                        # репо-root: workspace @mushroom-map/web

# Migrations
.venv/Scripts/python.exe db/migrate.py

# Re-ingest Rosleshoz vydels (takes ~15-30 min for ~1M polygons)
.venv/Scripts/python.exe -u pipelines/ingest_forest.py \
  --source rosleshoz --region lenoblast \
  --rosleshoz-file data/rosleshoz/fgislk_vydels_karelian.geojson \
  --rosleshoz-version fgislk-karelian-2026 \
  --dsn "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map"

# Rebuild forest.pmtiles after ingest (needs DATABASE_URL env var, NOT --dsn)
DATABASE_URL="postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map" \
  .venv/Scripts/python.exe -u pipelines/build_tiles.py --region lenoblast

# Build terrain from scratch: download 81 Copernicus DEM tiles (~1.6 GB) ->
# mosaic/reproject/derive slope+aspect+hillshade -> hillshade.pmtiles (~453 MB).
.venv/Scripts/python.exe -u scripts/download_copernicus_dem.py
.venv/Scripts/python.exe -u pipelines/build_terrain.py --step all
.venv/Scripts/python.exe -u pipelines/build_hillshade_tiles.py

# Re-extract geojson from cached FGIS LK vector tiles
.venv/Scripts/python.exe -u pipelines/fgislk_tiles_to_geojson.py \
  --in data/rosleshoz/fgislk_tiles \
  --out data/rosleshoz/fgislk_vydels.geojson

# Districts (admin_level=6) of LO from OSM Overpass. Populates admin_area
# and rewrites region.geometry via ST_Union of districts.
.venv/Scripts/python.exe -u scripts/download_districts_overpass.py
.venv/Scripts/python.exe -u pipelines/ingest_districts.py --region lenoblast

# Gazetteer (OSM places/lakes/rivers/stations) + VK post -> district via Natasha NER.
# load_gazetteer: 5x5 bbox split, per-tile tolerance; ~21k entries for LO.
# --skip-admin keeps our 18 districts from ingest_districts.py untouched.
PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe -u pipelines/load_gazetteer.py --region lenoblast --skip-admin
PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe -u pipelines/extract_vk_districts.py --region lenoblast

# Typecheck web
cd apps/web && export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit

# API container logs (for 500 errors that manifest as CORS in the browser)
docker compose logs --tail 50 api

# Run all tests (smoke API + unit). Smoke skipped if docker not up.
.venv/Scripts/python.exe -m pytest -q

# ─── Production деплой ──────────────────────────────────────────────
# Полный runbook — docs/deployment.md. Краткая шпаргалка:
#
# Локальный prod-build образа API (валидация перед push в GHCR):
docker build -f services/api/Dockerfile.prod -t mushroom-api:prod .
#
# На VM (Yandex Cloud, Ubuntu 22.04 — alias `geobiom-prod` в ~/.ssh/config):
#   bash scripts/deploy/bootstrap_oracle.sh   (один раз; скрипт назван так
#                                              исторически — Oracle был первой
#                                              целью, реально работает на любом
#                                              Ubuntu 22+ с docker)
#   docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
#
# DB-миграции в проде (изнутри контейнера):
#   docker compose -f docker-compose.prod.yml exec -T api \
#       python /app/db/migrate.py
#
# pg_dump из локали в прод:
#   REMOTE=root@<vm-ip> bash scripts/deploy/sync_db_to_remote.sh
#
# PMTiles + places.geojson -> Cloudflare R2 bucket `geobiom-tiles`:
#   bash scripts/deploy/sync_tiles_to_r2.sh
```

## Production стек (live с 2026-04-28)

- **Фронт** — Cloudflare Pages, `geobiom.ru`. Деплой авто через
  `.github/workflows/deploy-web.yml` (push на main).
- **API** — Yandex Cloud VM `178.253.43.136`, alias `geobiom-prod` в
  локальном `~/.ssh/config`. Деплой через `.github/workflows/deploy-api.yml`:
  build → push в GHCR → ssh на VM → `docker compose pull && up -d` →
  `db/migrate.py`. Хост `api.geobiom.ru`.
- **PMTiles** — Cloudflare R2 bucket `geobiom-tiles`, custom domain
  `tiles.geobiom.ru`. Vite-env `VITE_TILES_URL=https://tiles.geobiom.ru`
  (CF Pages prod env). CORS policy на bucket allowед `https://geobiom.ru`
  + Range/If-Match/If-None-Match headers. Заливка:
  `bash scripts/deploy/sync_tiles_to_r2.sh` (rclone remote `r2`,
  скрипт грузит `*.pmtiles` + `*.geojson`).
- **CF Pages env vars** (Production):
  - `VITE_API_URL` = `https://api.geobiom.ru`
  - `VITE_TILES_URL` = `https://tiles.geobiom.ru`
- **GitHub secrets** (для deploy-api):
  - `PROD_HOST` = IP VM
  - `PROD_SSH_USER` = `root` (YC образ; не `ubuntu` как было на Oracle)
  - `PROD_SSH_KEY` = приватная часть `~/.ssh/geobiom_yc`
- **Известные грабли:**
  - Vite env-vars **запекаются во время build'а** — менять переменную в
    CF Pages → редеплой обязателен, иначе старый bundle подхватит старое.
  - `api.geobiom.ru/tiles/*` отдаёт 404 (API не раздаёт static в prod).
    Все ссылки на тайлы должны идти через `TILES_BASE` (см.
    `apps/web/src/components/mapView/utils/api.ts`), не через `API_ORIGIN`.
  - Каждый `git push` обязательно проверять `gh run list` — `deploy-web`
    обычно ~1 мин, `deploy-api` ~5 мин.

## Pre-prod-deploy checklist (для будущих environments / staging)

1. **Yandex OAuth callback URL.** На [oauth.yandex.ru](https://oauth.yandex.ru/)
   проектное приложение → Redirect URI добавить
   `https://<host>/api/auth/yandex/callback`. Без этого вход откажет с
   `redirect_uri_mismatch`.
2. **`.env.prod` секреты на VM:** `JWT_SECRET` (32+ байт),
   `OAUTH_STATE_SECRET` (отдельные 32+ байт), `YANDEX_CLIENT_ID/SECRET`,
   `DATABASE_URL=postgresql://mushroom:...@db:5432/mushroom_map`.
3. **DB:** `REMOTE=root@<vm-ip> bash scripts/deploy/sync_db_to_remote.sh`
   (скрипт умеет fallback'нуть на `docker exec mushroom_db pg_dump`
   когда host pg_dump не установлен).
4. **PMTiles → R2.** `bash scripts/deploy/sync_tiles_to_r2.sh`. Без этого
   forest и hillshade слои будут 404'иться в проде.
5. **DNS A-запись** в Cloudflare на IP VM. Делать ПОСЛЕ того, как VM
   ответит 200 на `https://<vm-ip>/health` — иначе CF Universal SSL
   не выдаст cert.

VM-статус и hosting-fallback живут в memory-файле
`project_website_migration.md`.

## Deprecated (don't extend, don't rely on)

- **`observation` table + `vk_post.observation_written` column.** Старый
  flow «продвигать VK-пост в наблюдение с координатой» так и не дошёл до
  Stage-4: таблица всегда пустая, `observation_written` вечно FALSE. Район
  у поста живёт в `vk_post.district_admin_area_id` (см. `extract_vk_districts.py`).
  Mat-view `observation_h3_species_stats` и API-endpoint'ы вокруг него
  тоже мёртвые. Не дропаем (потенциально пригодится для POI-уровня), но
  ничего туда не пишем и тестов на это не вешаем.
- **`pipelines/extract_places.py`.** Часть deprecated flow выше. Заменён
  `pipelines/extract_vk_districts.py`. Не вызывается из активных пайплайнов.

## Shared script utilities

- `scripts/_bbox.py` — `LO_BBOX_DEFAULT` + `load_bbox(env_var)` /
  `load_split(env_var, default)`. Все `download_*_overpass.py` (oopt /
  roads / waterway / wetland) читают bbox через эти helpers.
  Env-имена: `OOPT_BBOX`, `ROADS_BBOX` / `ROADS_SPLIT`, `WATERWAY_BBOX` /
  `WATERWAY_SPLIT`, `WETLAND_BBOX` / `WETLAND_SPLIT`. Формат:
  `south,west,north,east`. Не задано → default LO `(58.5, 27.8, 61.8, 33.0)`.
- `scripts/_overpass.py` — `overpass_post(query, timeout_s=...)` и
  `overpass_elements(query, ...)`. Stdlib-only клиент (urllib) с
  mirror-rotation + 429/503/504 retry. Канонический httpx-based клиент
  для пакета `placenames` живёт в `services/placenames/.../gazetteer.py`
  — это два separate-by-design (scripts остаются zero-dep).

## Architecture — the contract

- **`soil_polygon` + `soil_profile` + lookups (`soil_type`, `soil_parent`)**
  — почвенная карта Докучаевского ин-та (1:2.5М, EGRPR/soil-db.ru). Полигоны
  с soil0/1/2/3 (комплекс) и parent1/2 (порода); 9 точечных разрезов в bbox
  ЛО+Карелия с pH/CORG. Слой `soil.pmtiles` (1.9 МБ); endpoint `/api/soil/at`
  возвращает polygon + profile_nearest. Используется как feature-extractor
  для модели в sister-репо `ik_mushrooms_parser`.
- **`osm_waterway`** — линейные водотоки из OSM (stream/river/canal/drain/ditch).
  ~204k записей в ЛО. Слой `waterway.pmtiles` (26 МБ, zoom 9–14). Endpoint
  `/api/water/distance/at` возвращает минимум по трём источникам (waterway /
  water_zone / wetland) с KNN-индексом — feature-extractor для proxy
  «расстояние до воды → влажность».
- **`admin_area` (level=6)** — 18 районов ЛО из OSM (17 муниципальных + Сосновоборский
  ГО). Собираются через Overpass area-query (map_to_area от relation "Ленинградская
  область" admin_level=4); outer-segments склеиваются в полигоны через
  `shapely.polygonize + unary_union`. Endpoint `/api/districts/` отдаёт GeoJSON
  FeatureCollection (без PMTiles — 18 фич ~0.7 МБ), `/api/districts/at?lat=&lon=`
  матчит точку в район с `ORDER BY ST_Area ASC LIMIT 1` (inner-holes типа
  Сосновый Бор-анклав не учтены). Используется как будущая основа
  choropleth-слоя прогноза плодоношения (район × день × группа).
  `region.lenoblast.geometry` пересобирается из ST_Union(admin_area) при
  каждом ingest — исходный bbox-прямоугольник из миграции 002 заменяется
  реальным контуром.
- **`gazetteer_entry` + `vk_post.district_admin_area_id`** — топонимы из OSM
  (~21k: 6.8k settlements + 6.1k lakes + 5.8k rivers + 2k tracts + 0.4k stations)
  + Natasha NER поверх `vk_post.text`. Скачка через `load_gazetteer.py` —
  bbox режется 5×5 из-за 406/504/403 от Overpass на тяжёлых центральных тайлах,
  per-tile tolerance (скипаем проблемные, собираем оставшееся). Линковка места →
  район через `ST_Contains` при upsert (под условием `has_admin` в БД — не
  зависит от `--skip-admin`). Пайплайн `extract_vk_districts.py`: text → Natasha
  LOC spans → `GazetteerMatcher` (exact/alias/trgm) → лучший матч по
  `(confidence, kind-priority)` → `admin_area_id` напрямую или ST_Contains fallback.
  На 69k постов `grib_spb`: ~5.6k (8%) получают район, остальное — `ner_empty` +
  stopwords ("СПб"/"Россия") + match outside districts. avg confidence 0.988.
  Поля в `vk_post`: `district_admin_area_id`, `district_confidence`,
  `place_extracted_at`, `place_match JSONB`. **Это ключевая фича для forecast-модели**
  (район × день × группа).
- **Regex-fallback** `scripts/regex_district_check.py` — 18 ЛО-районов + Карелия +
  Новгородская/Псковская/Тверская/Вологодская + СПб-районы (Курортный, Приморский,
  Колпинский, Пушкинский, Красносельский, Невский) + города (СПб, Москва).
  Паттерны на корне прилагательного (`\bвыборгск\w*`) + донор-топонимы
  (Лемболово → Всеволожский, Рощино → Выборгский и т.д.). Обходит недостатки NER
  с хештегами и прилагательными формами. Все найденные места пишутся в
  `vk_post.place_match.detected_places = [{"name":..., "kind":...}]` — kind =
  `district_lo | subject_ru | district_spb | city`. После прогона:
  41508 LO-district matches (60% vs NER'овские 8%), 4297 mention'ов
  соседних субъектов, 3784 — СПб-районов, 1285 — Карелии. Решение, что из
  этого брать в модель, принимается SQL-фильтром в mushroom-forecast
  (по `place_match->'detected_places'`).
- **Terrain (Copernicus GLO-30 DEM)** — файловые растры в `data/copernicus/terrain/`,
  НЕ в БД (огромный объём, сэмплинг с диска быстрее). `dem_utm.tif` + `slope.tif`
  + `aspect.tif` в EPSG:32636 UTM 36N, 30 m/px. Endpoint `/api/terrain/at`
  читает через rasterio.sample — feature-extractor модели (высота/уклон/экспозиция).
  `hillshade.pmtiles` (~453 МБ, zoom 6–11, RGBA PNG raster) — цветной рельеф:
  гипсометрия по высоте из `dem_utm.tif` × модуляция hillshade. Собирается
  через `pipelines/build_hillshade_tiles.py` (два WarpedVRT UTM→3857, PIL → pmtiles).
  Alpha=0 по маске DEM nodata — убирает тёмные треугольники на углах реекции.
  API требует `rasterio` + `pyproj` и volume mount
  `./data/copernicus/terrain:/terrain:ro`.
- **`forest_polygon` table** holds raw polygons from multiple sources
  (osm, terranorte, copernicus, rosleshoz). Each row has
  `source`, `source_version`, `source_feature_id` (composite unique key),
  `dominant_species`, `species_composition JSONB`, `meta JSONB` (bonitet,
  timber_stock, age_group live here). Geometry is 4326 MULTIPOLYGON.
- **`forest_unified` VIEW** picks the polygon with the highest source
  priority at each location (rosleshoz=60 > copernicus=50 > terranorte=45
  > osm=10). API reads from the VIEW; PMTiles are built from the VIEW.
- **Species slug vocabulary** is frozen (`pine`, `spruce`, `birch`, ...).
  Don't rename, only add. It's the contract between `geodata` (Python)
  and `species_forest_affinity` (SQL) and `forestStyle.ts` (frontend).
- **PMTiles are served via FastAPI StaticFiles** from
  `services/api/.env:TILES_DIR=../../data/tiles`. Browser fetches with
  HTTP Range. Do not break this.

## MapView architecture (post-refactor 2026-04-29)

`apps/web/src/components/MapView.tsx` — тонкий orchestrator (101 строка),
монтирует хуки и UI-компоненты. Прежние 837 строк с 12 toggle-handler'ами,
24 useState/useRef парами и 60-строчным `setupForestAndInteractions` —
схлопнуты в декларативный реестр + единый controller-хук.

**Single source of truth:** `apps/web/src/store/useLayerVisibility.ts`
(Zustand). Хранит всё map-state'ом: `visible`/`loaded` × 13 LayerKey,
`baseMap`, `forestColorMode`, `speciesFilter`, `errorMsg`, `vpnToast`,
`forestHint`, `shareToast`, `speciesFilterLabel`. Никаких useState в
MapView и компонентах карты — все читают из store.

**Layer registry:** `apps/web/src/components/mapView/registry.ts` —
декларативный массив 12 entries (`forest`, `water`, `waterway`, `wetland`,
`oopt`, `roads`, `felling`, `protective`, `soil`, `hillshade`, `districts`,
`forecastChoropleth`). `userSpots` data-driven, не в реестре. Каждый entry:
`{id, pmtiles, missingMsg, add, setVisibility, sources, layers}`. Добавление
13-го слоя = 1 файл + 1 запись (см. секцию «Adding a new data layer»).

**Hooks** (в `apps/web/src/components/mapView/hooks/`):
- `useMapInstance(containerRef, initialView, onReady)` — создаёт MapLibre
  Map, монтирует controls, парсит `?lat&lon&z`. Возвращает `{map, ready}`.
  `ready` flips true после первого `styledata + isStyleLoaded()` —
  критично, иначе `useMapLayers` стреляет до создания карты (race fix
  794a1ac).
- `useMapLayers(map, ready)` — единственный controller между store и
  MapLibre. Lazy-add с HEAD-check'ом, toggle visibility, переприменение
  forestColorMode/speciesFilter, `reapplyAll()` callback для basemap-switch.
- `useBaseMap(map, onAfterApply)` — setStyle + RAF-poll до `isStyleLoaded`,
  затем дёргает onAfterApply (в MapView re-add'ит places + userSpots +
  `reapplyAll()`).
- `useMapPopup(map)` — click → fetch forest/soil/water/terrain → попап.
- `useMapUrl(map)` — moveend → `?lat&lon&z` history.replaceState.
- `useUserSpotsSync(map, spots)` — приватный data-driven layer.
- `useMapShare(map)` — clipboard share callback.
- `useMouseLngLat(map)` — координаты под курсором.
- `useToastLifecycles()` — VPN/forestHint fade lifecycles.

**UI components** (в `apps/web/src/components/mapView/`):
- `LayerGrid` (primary 7 + secondary 8 disclosure, `floating?` prop)
- `BaseMapPicker` (floating top-left)
- `ShareButton` (floating bottom-right)
- `MapOverlays` (4 тоста: share/error/vpn/forestHint)
- `CursorReadout` (desktop only)
- `SpeciesFilterBadge`
- `Legend` (self-subscribed, без props)

**`MapControls.tsx` удалён** в Phase 4. Не возвращать.

Полный спек/план: `docs/superpowers/specs/2026-04-29-mapview-decomposition-design.md`,
`docs/superpowers/plans/2026-04-29-mapview-decomposition.md`.

## Adding a new data layer (pattern)

1. **Migration** `db/migrations/NNN_<name>.sql` — table + GIST index.
2. **Downloader** in `scripts/download_<name>_overpass.py` (or similar).
   If the bbox is big, split into grid + dedupe. Save to `data/<name>/`.
3. **Ingest** `pipelines/ingest_<name>.py` — reads GeoJSON, writes DB.
   Idempotent by (source, source_version). For 100k+ rows use
   `services/geodata/src/geodata/db.py` COPY+DELETE pattern.
4. **Tile build** `pipelines/build_<name>_tiles.py` — PostGIS → MVT →
   `data/tiles/<name>.pmtiles`. Use `build_water_tiles.py` as template.
5. **Frontend** — после refactor'а MapView 2026-04-29 добавление слоя =
   1 файл + 1 запись в реестре + 1 чип:
   - `apps/web/src/components/mapView/layers/<name>.ts` — экспортирует
     `add<Name>Layer(map)` и `set<Name>Visibility(map, visible)` (template:
     любой существующий layer-модуль).
   - `apps/web/src/components/mapView/registry.ts` — новая запись в
     `LAYER_REGISTRY` со значениями `pmtiles`, `missingMsg`, `add`,
     `setVisibility`, `sources`, `layers`. `useMapLayers` хук подхватит
     автоматически — HEAD-check, lazy-add, basemap-switch reapply.
   - `apps/web/src/components/mapView/LayerGrid.tsx` — добавить чип в
     `primaryChips` или `secondaryChips`.
   - `apps/web/src/store/useLayerVisibility.ts` — добавить ключ в
     `LayerKey` union + дефолты в `DEFAULT_VISIBLE`/`DEFAULT_LOADED`.
   Никаких правок в MapView.tsx, useMapLayers, useBaseMap или прочих хуках.

Python normalize must stay thin. If profiling shows shapely/wkt/area in
the hot path, push them to SQL (see rosleshoz WKB pass-through for how).

## Rules of engagement for changes

**Process:**
- **Verify root cause before iterating.** Last session I rewrote the
  scheme basemap 7 times across 3 providers without once checking if
  the URL was even returning 200. Always `curl -I <url>` first when a
  network resource is implicated.
- **Don't add fallbacks on fallbacks.** If a fetch fails, fix the
  fetch. Don't stack "try this, then that, then the other" — it hides
  the root cause and creates fragile behavior matrices.
- **Respect the user's git history.** Use `git log --oneline -20` at
  the start of a session to see what was just done — the story is in
  the commits.
- **Match the existing style of the file you're editing**, even if you'd
  do it differently in a fresh project. Consistency inside one repo beats
  global consistency with your own preferences.
- **Every changed line should trace directly to the user's request.**
  If a diff contains cleanup / rename / refactor that the user didn't
  ask for, cut it out and ask first.
- **State assumptions explicitly.** If a request is ambiguous, name
  what's unclear in one sentence and pick a direction — don't silently
  guess, don't freeze up asking for specs.

**Project-specific facts:**
- **Scheme/hybrid basemap tiles**: `tiles.openfreemap.org` and
  `basemaps.cartocdn.com/rastertiles/*` are unreachable from this
  user's network. `server.arcgisonline.com` and `tiles.versatiles.org`
  work. The current choice is Versatiles Colorful (vector) patched
  in-app for sprite-array and text-size.
- **Hybrid mode** = Versatiles Colorful with ESRI satellite raster
  injected as the bottom layer and all fill layers removed (so only
  line + symbol vector layers draw over the imagery). The patch lives
  in `buildHybridStyle()` in `mapView/styles/hybrid.ts`.
- **Forest layer z-order**: forest-fill is inserted before the first
  symbol layer (`findFirstSymbolLayerId`), so labels stay on top.
  Same pattern for water/oopt overlays.

## VK photo classification pipeline

`pipelines/ingest_vk.py` — four stages run in sequence or individually via `--step`.

```bash
# Full pipeline
.venv/Scripts/python.exe -u pipelines/ingest_vk.py --group grib_spb --region lenoblast

# Single stage (e.g. re-run photos only)
.venv/Scripts/python.exe -u pipelines/ingest_vk.py --group grib_spb --region lenoblast --step photos

# Report (random 500 posts with filter panel)
.venv/Scripts/python.exe pipelines/vk_photos_report.py --limit 500 --random --out vk_photos_report_random500.html
```

### Model & workers

- Model: `qwen/qwen3.5-9b` via LM Studio on `localhost:1234`. Default, no `--model` flag needed.
- Workers: `--workers 5` (default). LM Studio must have **Parallel = 5** set for the loaded model.
- Thinking must be disabled: `chat_template_kwargs.enable_thinking=False` is set in `_ask_model`. The `/no_think` prefix alone is not enough through LM Studio.
- `PHOTO_PROMPT_VERSION` controls reprocessing: when code version != DB version, photos_stage reruns all posts automatically.
- **Prompt + JSON Schema живут в `pipelines/prompts/vk_classify_v9.txt` и
  `vk_classify_schema_v9.json`** — версионированы по имени файла. Новая
  версия → создать `vk_classify_v10.{txt,json}`, бампнуть `PHOTO_PROMPT_VERSION`,
  обновить пути в `ingest_vk.py` (две строки).

### Current prompt version: `v13-birch-strict-pine-softer-2026-04-24`

History:
- v7: baseline Gemma prompt, 13 species
- v8: Qwen, added mokhovik/pine_bolete/fly_agaric/berries, soft species limit, count cap 150
- v9: merged chanterelle group (trumpet+вороночник→chanterelle), loosened pine_bolete (porcini is default), 6-photo sampling (was 4)
- v10: balanced porcini ↔ pine_bolete by cap tone (light vs dark, no «default»), added split-by-tone tie-break for mixed baskets; aspen_bolete strengthened via dark-scaled-stem diagnostic + extended cap palette
- v11: expanded spring_mushroom into morel / verpa / gyromitra triplet with explicit verpa-anti-porcini guard (the «pile of pale stems with little brown caps» case); added Sarcoscypha disambiguation inside russula entry; pruned Russian/Latin names + ecology comments — net size unchanged vs v10
- v12: split Leccinum palettes — pine_bolete is now pure brown (chestnut/mahogany/dark-brown, explicit «not orange/red/rust»); aspen_bolete is strictly orange/red (combination of dark-scaled stem AND orange/red cap is the diagnostic, not stem alone); birch_bolete expanded (pale beige / grey-brown / tan / mushroom-brown / medium / dark brown — «same Leccinum stem as aspen, but cap plain brown/grey-brown»). Fixes systematic aspen → pine_bolete misclassification observed in v11.
- v13: fixes v12 over-detection of birch_bolete + slightly softens pine_bolete. birch_bolete palette trimmed (only grey-brown / tan / mushroom-brown; removed pale beige, medium brown, dark brown that overlapped with porcini/pine) and now requires VISIBLE dark scales on the stem — no stem, no birch call. pine_bolete tightened: «clearly DARK cap», and new rule «if cap is only medium brown and could be porcini, prefer porcini»; same lean into porcini in the TIE-BREAK.

### CLASSIFY_SCHEMA species enum (18 keys)

```
porcini, pine_bolete,
aspen_bolete, birch_bolete, mokhovik,
chanterelle,
saffron_milkcap, white_milkcap, woolly_milkcap,
spring_mushroom, honey_fungus, oyster, russula, fly_agaric,
blueberry, cloudberry, cranberry,
other
```

### GROUP_TO_SLUGS (what promotes to species table)

| key | slugs |
|---|---|
| porcini | boletus-edulis |
| pine_bolete | boletus-edulis (same slug — разделение только для статистики) |
| aspen_bolete | leccinum-aurantiacum, leccinum-versipelle |
| birch_bolete | leccinum-scabrum |
| mokhovik | xerocomus-subtomentosus |
| chanterelle | cantharellus-cibarius, craterellus-tubaeformis |
| saffron_milkcap | lactarius-deliciosus |
| white_milkcap | lactarius-resimus |
| woolly_milkcap | lactarius-torminosus |
| spring_mushroom | morchella-esculenta, verpa-bohemica, gyromitra-esculenta |
| honey_fungus | armillaria-mellea, kuehneromyces-mutabilis |
| oyster | pleurotus-ostreatus |
| russula | russula-vesca |
| fly_agaric | amanita-muscaria |
| blueberry / cloudberry / cranberry | (нет маппинга — в отчёты, но не в species) |

### Key model prompting rules

- `porcini` = default для любого белого гриба с коричневой шляпой. `pine_bolete` только если шляпа UNMISTAKABLY very dark (near-black, mahogany).
- `chanterelle` = все лисички: обычная, трубчатая, вороночник. Один ключ — один entry с суммой.
- Берёт до 6 фото на пост равномерно (если > 6 фото), иначе все.
- `max_tokens = 1000`, schema-constrained JSON output.

## Gotchas you will hit

- **Forest PMTiles is ~322 MB.** That's intentional after 913k polygons.
  Range requests keep the browser fast.
- **setStyle() clears custom sources.** Every basemap switch
  destroys forest/water/oopt/roads layers. `setupForestAndInteractions()`
  re-adds them after `styledata` fires.
- **MapLibre `styledata` fires multiple times** during load (once per
  sub-resource). Always guard with `m.isStyleLoaded()` inside the handler.
- **MapLibre `load` event may never fire** if external tiles stall.
  Use `styledata` + `isStyleLoaded()` for "ready", never `load`.
- **Layer toggles during basemap switch** = race. The handler must
  `m.once("idle", ...)` if `!m.isStyleLoaded()`, otherwise the new
  style wipes the freshly-added layer.
- **FGIS LK tile cache is at `data/rosleshoz/fgislk_tiles/12/`**.
  ~700k .pbf files for the full bbox. Re-extraction is cheap; re-download
  is slow.
- **Species search** returns 500 → reads in the browser as CORS error
  because FastAPI doesn't attach CORS headers to error responses. When
  you see "blocked by CORS policy" on an endpoint that used to work,
  check `docker compose logs api` for the real exception.

