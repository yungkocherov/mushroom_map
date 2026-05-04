# CLAUDE.md — project context for Claude Code sessions

This file is auto-loaded at the start of every session. **Durable
conventions, commands, gotchas only.** Time-stamped status / running
log / past phase details — в memory (`MEMORY.md`) или в архивных
plan-файлах (`docs/archive/`). Не вешать сюда «what shipped today» —
для этого есть git log.

Pointers:
- Architecture: `docs/architecture.md`
- Redesign 2026-04 (current IA, phases 1 done / 2 in progress): `docs/redesign-2026-04.md`
- Why Rosleshoz: `docs/forest_sources_analysis.md`
- Mobile (Geobiom Android): `docs/mobile-app-2026-05.md`
- Production runbook (two-stack): см. секцию ниже + `docs/deployment.md` (legacy initial setup)
- Backup runbook: `scripts/backup/README.md`
- Observability runbook: `services/observability/README.md`

## One-line summary

Interactive forest+forage map for Leningrad Oblast (rebrand
**`mushroom-map` → Geobiom**, prod live на `geobiom.ru`). PostGIS +
FastAPI + React + MapLibre GL + PMTiles + Zustand. Forest polygons из
Rosleshoz/ФГИСЛК (~2M, full LO coverage), раскраска по dominant
species / bonitet / age group; click → popup с bonitet/age + theoretical
fungi из species registry. Home (`/`) = карта c collapsible sidebar.

**Brand:** lowercase `geobiom` в URL/files, Title Case в UI/prose. Repo
и npm-workspace names (`@mushroom-map/*`) переименуются позже.

**Sibling repo `mushroom-forecast`** в `C:\Users\ikoch\mushroom-forecast`
(GitHub: yungkocherov/mushroom-forecast, private). Владеет схемой
`forecast.*` в этой же Postgres-базе. mushroom-map **только читает**
`forecast.prediction` (будущий `/api/forecast/at`). В `public.*` из
forecast-репо не пишем — двусторонний контракт.

**Mobile app `apps/mobile`** — React Native + Expo bare +
maplibre-react-native, Android only (RuStore + APK direct), iOS
отложен. SQLCipher (op-sqlite v15), bundled basemap PMTiles, per-district
download manager. Dev-setup: JDK 17 + Android SDK через cmdline-tools
(без Android Studio IDE), pmtiles CLI v1.22.2 в `%USERPROFILE%\bin\`.
Полные требования и phase-log — `docs/mobile-app-2026-05.md`,
`apps/mobile/README.md`.

## IA & key routes

```
/                        → map-as-home (Sidebar + MapView, sidebar collapsible)
/map                     → 301 → /
/map/:district           → district detail
/species, /species/:slug → catalog + detail (без CTA «Открыть на карте»)
/spots                   → «Сохранённые места» (auth-gated)
/cabinet/spots           → 301 → /spots
/methodology[/:slug]     → MDX articles hub
/about                   → 301 → /methodology/about
/legal/{privacy,terms}   → live
/auth/*                  → Yandex OAuth
```

`grid-column:2` на MapPane задаётся **явно** — иначе при `display:none`
sidebar'а MapPane уезжает в 0px колонку (баг 2026-04-28). Полный спек IA —
`docs/redesign-2026-04.md`.

**District forecast choropleth:** по умолчанию выключен (раскраска по 18
районам отражала бы географию VK-постов, не реальное распределение
грибов). Слой жив в реестре + чип «Прогноз» в LayerGrid + `DateScrubber`
в SidebarDistrict + endpoint `/api/forecast/districts`. Включается
вручную; ждёт точечной forecast-модели для пересмотра дефолта.

**user_spot.tags** (TEXT[], миграция 029) + **rating** (SMALLINT 1..5,
миграция 030 — заменила старый color enum). Tag-словарь шарится через
`@mushroom-map/types/spotTags` (web + mobile, 11 деревьев + 13 грибов
+ 5 ягод). Цвет маркера производный от rating через
`apps/web/src/lib/spotRating.ts`.

Global UI primitives:
- **Spotlight (⌘K)** — `apps/web/src/components/Spotlight.tsx`,
  Radix Dialog. `/api/species/search` + `/api/places/search`.
- **BottomSheet (mobile web)** — 3 snap, `@use-gesture/react` +
  `@react-spring/web`.
- **LayerGrid** — primary 7 + secondary 8 чипов под disclosure. Source
  of truth: store `useLayerVisibility`. Floating-режим внутри MapView
  (`floating?` prop), inline в Sidebar.
- **Per-page `<title>` / meta** — `useLayerTitle` хук в
  `apps/web/src/lib/usePageTitle.ts`.

Methodology MDX в `apps/web/src/content/methodology/`, frontmatter с
`category`. Hero photo manifest scaffold —
`apps/web/src/content/photos.json` + `photos-candidates.md` (TODO).

Map state в Zustand:
- `useLayerVisibility.ts` — 13 layer keys + forestColorMode + UI-toasts
- `useMapMode.ts` — `'overview' | 'district'` + selected district
- `useForecastDate.ts` + `useForecastDistricts.ts` — date scrubber + cached fetch

## Iteration workflow — ОБЯЗАТЕЛЬНО

Не закрывай итерацию без: (1) commit + push в origin, (2) апдейт
memory-файлов (`MEMORY.md` + relevant `reference_*.md` / `project_*.md`),
(3) фиксация exit-state в активном plan-файле если он был. Полная
версия правила — в `mushroom-forecast/CLAUDE.md`, этот репо следует
тому же протоколу.

## Environment quirks — read this first

- **Python venv**: `/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe`
  (Python 3.14). Никогда просто `python` — system Python без deps.
- **Node**: `/c/Program Files/nodejs/` не на PATH в bash по дефолту.
  Перед `npm`/`npx`: `export PATH="/c/Program Files/nodejs:$PATH"`.
- **Postgres port 5434** (не 5432). Native Windows Postgres на 5432.
  DSN: `postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map`.
  API в Docker → `db:5432` через compose network — нормально.
- **Vite proxy → `127.0.0.1:8000`**, не `localhost`. Node 18+ резолвит
  localhost в IPv6 first, uvicorn слушает IPv4. NOT a bug.
- **Windows cp1251**: не клади `→`, `←`, Unicode arrows в `print()` —
  Python падает с UnicodeEncodeError при redirect. Используй `->` / `<-`.
- **psycopg3 — `cursor.executemany()`**, не `conn.executemany()`
  (последнее работало на psycopg2, на psycopg3 ошибка).
- **psycopg3 строго парсит `%`** даже в SQL-комментариях и string
  literals. Любой одиночный `%` → `incomplete placeholder`. Trap:
  комментарий `-- 1-2% площади` или `print(f"{x}%")`. Решение —
  экранировать `%%` или избегать.
- **Vite HMR на Docker+Windows**: polling-режим в `vite.config.ts`.
- **Web dev запускается на хосте** (с Phase 1 D3): Docker+WSL2+virtiofs
  ловит esbuild OOM на bind-mount workspace-репо. Service `web` в
  профиле `full-web`, не поднимается через `--profile full`. Dev-loop:
  `export PATH="/c/Program Files/nodejs:$PATH" && npm run dev`.
  Host-side новый npm-пакет: `npm install --workspace=@mushroom-map/web <pkg>`.
- **PMTiles Range requests** идут напрямую в API
  (`http://${API_ORIGIN}/tiles/...`), не через Vite proxy (Vite плохо
  держит Range).

## Common commands

```bash
# Backend stack (db + api). Web фронт — на хосте через `npm run dev`.
docker compose --profile full up -d

# DB only (для API/web разработки без докеризированного API)
docker compose up -d db

# Фронт — hot-reload Vite на хосте
export PATH="/c/Program Files/nodejs:$PATH" && npm run dev

# Migrations
.venv/Scripts/python.exe db/migrate.py

# Forest data — bulk-скрап ФГИС API (current path, см. memory/reference_fgislk_api.md).
# Включи AdGuard split-tunnel exclusion для pub.fgislk.gov.ru / pub5.fgislk.gov.ru
# (или выключи VPN полностью) — RU IP обязателен.
.venv/Scripts/python.exe pipelines/scrape_fgislk_attrinfo.py \
  --start 109022831 --end 109118831 --workers 30
# Resume-friendly: progress в data/rosleshoz/fgislk_attrinfo_progress.db

# Re-ingest GeoJSON в forest_polygon
.venv/Scripts/python.exe -u pipelines/ingest_forest.py \
  --source rosleshoz --region lenoblast \
  --rosleshoz-file data/rosleshoz/fgislk_attrinfo.geojson \
  --rosleshoz-version fgislk-attrinfo-2026-05 \
  --dsn "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map"

# Rebuild forest.pmtiles (use DATABASE_URL env, NOT --dsn)
DATABASE_URL="postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map" \
  .venv/Scripts/python.exe -u pipelines/build_tiles.py --region lenoblast
# minzoom=5, maxzoom=13. z<=8 — coarse-путь (ST_Union в один 'mixed' полигон,
# сплошной зелёный массив без дырок при отдалении). z>=9 — per-species.

# Terrain (one-time): 81 Copernicus DEM tiles → mosaic → hillshade.pmtiles (~453 MB)
.venv/Scripts/python.exe -u scripts/download_copernicus_dem.py
.venv/Scripts/python.exe -u pipelines/build_terrain.py --step all
.venv/Scripts/python.exe -u pipelines/build_hillshade_tiles.py

# Districts (admin_level=6 LO from OSM Overpass) → admin_area + region.geometry
.venv/Scripts/python.exe -u scripts/download_districts_overpass.py
.venv/Scripts/python.exe -u pipelines/ingest_districts.py --region lenoblast

# Gazetteer + VK post → district (Natasha NER)
PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe -u pipelines/load_gazetteer.py --region lenoblast --skip-admin
PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe -u pipelines/extract_vk_districts.py --region lenoblast

# Typecheck web
cd apps/web && export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit

# API container logs (для 500 в виде CORS в браузере)
docker compose logs --tail 50 api

# Tests (smoke API + unit; smoke skipped без docker)
.venv/Scripts/python.exe -m pytest -q

# Build forest.pmtiles via tippecanoe (5 мин на 2.17M полигонов, output ~318 MB)
bash pipelines/build_forest_tiles.sh

# PMTiles → VM (rsync)
bash scripts/deploy/sync_tiles_to_vm.sh             # все
bash scripts/deploy/sync_tiles_to_vm.sh forest      # один слой
```

## Production стек: two-stack (с 2026-04-30)

TSPU режет foreign-IP destinations для RU-юзеров без ВПН. Чистый Oracle
= 0% RU-no-VPN. Чистый RU-host = ~95% RU-no-VPN, проблемы у части
VPN-юзеров. Решение — **two-stack**, две независимые копии.

```
geobiom.ru / api.geobiom.ru / www.geobiom.ru  →  178.253.43.136 (TimeWeb, primary RU)
app.geobiom.ru / app-api.geobiom.ru           →  79.76.46.181 (Oracle Stockholm, foreign replica)
```

Обе VM используют один и тот же `docker-compose.prod.yml` (db + api +
caddy). Frontend — два билда (Vite-env-vars запекаются), `VITE_API_URL`
— per-stack. Tiles локально на каждой VM, отдаёт Caddy через
`/tiles/*`. DB-sync TimeWeb→Oracle nightly cron (~10 мин, заменяет full
db, Oracle на 24h stale — приемлемо).

**Aliases в `~/.ssh/config`:** `geobiom-prod-timeweb`, `geobiom-prod-oracle`.

**DNS:** A grey-cloud (DNS only) на CF. **НЕ ставить orange-cloud** —
TSPU режет CF SNI.

**Deploy:** `.github/workflows/deploy-{api,web}.yml` (push main → GHCR
build → ssh rsync → restart). На Oracle — manual rsync с dev (отдельный
GH workflow ещё не написан).

**GitHub vars/secrets:** `PROD_HOST=178.253.43.136`,
`PROD_SSH_USER=root`, `PROD_SSH_KEY` = `~/.ssh/geobiom_yc`,
`VITE_API_URL=https://api.geobiom.ru`, `PROD_DEPLOY_ENABLED=true`.
**НЕ задавать `VITE_TILES_URL`** — фронт fallback'ит на API.

**`.env.prod`:** `CADDY_API_HOST` / `CADDY_WEB_HOST` per-stack +
`CADDY_ACME_EMAIL` + `WEB_HOST_PATH=/srv/web`.

**Foreign basemap CDN** (`tiles.versatiles.org`,
`server.arcgisonline.com`) фронт дёргает напрямую — RU-no-VPN юзеры
через TSPU. Иногда работает по lottery (мелкие тайлы 5-30 KB).
Полный fix через caddy-proxy + патч URL во фронте отложен.

**Migration scripts (Oracle, 2026-04-30, contingency-only):**
`scripts/deploy/{bootstrap_oracle,cutover_to_oracle,smoke_test_prod,
cloudflare_set_ttl,cloudflare_dns_cutover,rollback_to_timeweb,
decommission_timeweb}.sh`. Cloudflare API token —
`~/.cloudflare/geobiom-api-token` (DNS-Edit zone).

История миграции и факты про TSPU — memory `project_website_migration.md`.

**Через 1 месяц review:** есть пользователи помимо автора → продолжаем
TimeWeb-primary; только автор → переезд на Oracle полностью.

**RU-VPS REG.RU Free Tier (dormant fallback):** `195.208.119.105`
(Москва-2), 1 vCPU / 1 GB. Caddyfile в `infra/Caddyfile.ru-proxy`.
Бесплатно до ~2026-10-30.

**Observability + Backup runbooks** — `services/observability/README.md`,
`scripts/backup/README.md`. Stack: GlitchTip (`sentry.geobiom.ru`) +
Umami (`analytics.geobiom.ru`); nightly pg_dump → age → Yandex Object
Storage с restore-drill через `scripts/backup/restore_drill.sh`.

## Deprecated (don't extend, don't rely on)

- **`observation` table + `vk_post.observation_written`.** Stage-4 «промоут
  VK-поста в наблюдение с координатой» так и не дошёл — таблица всегда
  пустая, флаг вечно FALSE. Район у поста живёт в
  `vk_post.district_admin_area_id` (см. `extract_vk_districts.py`).
  Mat-views `observation_h3_species_stats` и API-обвязка тоже мёртвые.
  Не дропаем (миграции immutable; потенциально пригодится для
  POI-уровня), но **ничего туда не пишем и тестов не вешаем**.

## Shared script utilities

- `scripts/_bbox.py` — `LO_BBOX_DEFAULT` + `load_bbox(env_var)` /
  `load_split(env_var, default)`. Все `download_*_overpass.py` читают
  bbox через эти helpers. Env: `OOPT_BBOX`, `ROADS_BBOX/SPLIT`,
  `WATERWAY_BBOX/SPLIT`, `WETLAND_BBOX/SPLIT`. Формат
  `south,west,north,east`. Default LO `(58.5, 27.8, 61.8, 33.0)`.
- `scripts/_overpass.py` — stdlib-only клиент (urllib) с
  mirror-rotation + 429/503/504 retry. Канонический httpx-based клиент
  для пакета `placenames` — в `services/placenames/.../gazetteer.py`
  (separate-by-design — scripts остаются zero-dep).

## Architecture — the contract

- **`forest_polygon` table** хранит raw полигоны из multiple sources
  (osm, terranorte, copernicus, rosleshoz). Каждая строка:
  `source`, `source_version`, `source_feature_id` (composite unique
  key), `dominant_species`, `species_composition JSONB`,
  `meta JSONB` (bonitet, timber_stock, age_group). Geometry
  4326 MULTIPOLYGON.
- **`forest_unified` VIEW** — выбирает полигон с highest source priority
  на каждой точке (rosleshoz=60 > copernicus=50 > terranorte=45 >
  osm=10). API читает из VIEW; PMTiles собираются из VIEW.
- **Species slug vocabulary** заморожен (`pine`, `spruce`, `birch`...).
  Не переименовывать, только добавлять. Контракт между `geodata`
  (Python), `species_forest_affinity` (SQL) и `forestStyle.ts` (FE).
- **PMTiles раздаются через FastAPI StaticFiles** из
  `services/api/.env:TILES_DIR=../../data/tiles`. Browser fetch с
  HTTP Range. Не ломать.

Слои-фичи:
- **`soil_polygon` + `soil_profile` + lookups** — почвенная карта
  Докучаевского ин-та (1:2.5М, EGRPR). Слой `soil.pmtiles` (1.9 MB);
  endpoint `/api/soil/at` → polygon + profile_nearest. Feature-extractor
  для модели в sister-репо.
- **`osm_waterway`** — линейные водотоки OSM (~204k в ЛО).
  `waterway.pmtiles` 26 MB. Endpoint `/api/water/distance/at` —
  минимум по три источника (waterway / water_zone / wetland) с
  KNN-индексом.
- **`admin_area` (level=6)** — 18 районов ЛО (17 муниципальных +
  Сосновоборский ГО). Overpass area-query от relation «Ленинградская
  область», outer-segments склеиваются `shapely.polygonize +
  unary_union`. `/api/districts/` — GeoJSON FeatureCollection (без
  PMTiles, ~0.7 MB), `/api/districts/at` — point-match с
  `ORDER BY ST_Area ASC LIMIT 1`. `region.lenoblast.geometry`
  пересобирается из `ST_Union(admin_area)` при каждом ingest.
- **`gazetteer_entry` + `vk_post.district_admin_area_id`** — топонимы
  OSM (~21k: settlements + lakes + rivers + tracts + stations) +
  Natasha NER. `load_gazetteer.py` режет bbox 5×5 (Overpass 406/504/403
  на тяжёлых тайлах), per-tile tolerance. Линковка → район через
  `ST_Contains` при upsert. Пайплайн `extract_vk_districts.py`:
  text → NER LOC spans → `GazetteerMatcher` (exact/alias/trgm) →
  `admin_area_id` напрямую или ST_Contains fallback. На 69k постов
  `grib_spb`: ~5.6k (8%) получают район через NER. **Ключевая фича
  для forecast-модели** (район × день × группа).
- **Regex-fallback** `scripts/regex_district_check.py` — 18 ЛО-районов
  + соседние субъекты + СПб-районы + города. Паттерны на корне
  прилагательного (`\bвыборгск\w*`) + донор-топонимы (Лемболово →
  Всеволожский). Все найденные места пишутся в
  `vk_post.place_match.detected_places`. На том же 69k: 41508 LO-district
  matches (60% vs 8% NER'а). Решение что брать в модель — SQL-фильтром
  в mushroom-forecast.
- **Terrain (Copernicus GLO-30 DEM)** — растры в
  `data/copernicus/terrain/`, **НЕ в БД** (объём огромен, sample с диска
  быстрее). `dem_utm.tif` + `slope.tif` + `aspect.tif` в EPSG:32636
  UTM 36N, 30 m/px. `/api/terrain/at` через `rasterio.sample`.
  `hillshade.pmtiles` (~453 MB, zoom 6–11) — гипсометрия по высоте ×
  hillshade. Alpha=0 по DEM nodata-маске убирает тёмные углы реекции.
  API требует `rasterio` + `pyproj` + volume mount
  `./data/copernicus/terrain:/terrain:ro`.

## MapView architecture (post-refactor 2026-04-29)

`apps/web/src/components/MapView.tsx` — тонкий orchestrator (~100
строк), монтирует хуки и UI. Прежние 837 строк с 12 toggle-handler'ами
и 24 useState схлопнуты в декларативный реестр + единый controller-хук.

**Single source of truth:** `apps/web/src/store/useLayerVisibility.ts`
(Zustand). Хранит всё map-state: `visible`/`loaded` × LayerKey,
`baseMap`, `forestColorMode`, `speciesFilter`, UI-toasts. Никаких
useState в MapView и компонентах — все читают из store.

**Layer registry:** `apps/web/src/components/mapView/registry.ts` —
12 entries (`forest`, `water`, `waterway`, `wetland`, `oopt`, `roads`,
`felling`, `protective`, `soil`, `hillshade`, `districts`,
`forecastChoropleth`). `userSpots` data-driven, не в реестре.

**Hooks** в `apps/web/src/components/mapView/hooks/`:
- `useMapInstance` — создаёт Map + controls + парсит `?lat&lon&z`,
  `ready` flag после `styledata + isStyleLoaded()`.
- `useMapLayers` — единственный controller между store и MapLibre.
  Lazy-add с HEAD-check, toggle visibility, reapply на basemap-switch.
- `useBaseMap` — setStyle + RAF-poll до `isStyleLoaded`, затем
  onAfterApply.
- `useMapPopup` — click → fetch forest/soil/water/terrain → попап.
- `useMapUrl` — moveend → `?lat&lon&z` history.replaceState.
- `useUserSpotsSync` — приватный data-driven layer.
- `useMapShare`, `useMouseLngLat`, `useToastLifecycles`.

**UI components** в `mapView/`: `LayerGrid`, `BaseMapPicker` (TL),
`ShareButton` (BR), `MapOverlays` (4 тоста), `CursorReadout`,
`SpeciesFilterBadge`, `Legend`. **`MapControls.tsx` удалён** в
Phase 4 — не возвращать.

Архивный полный спек/план — `docs/archive/2026-04-29-mapview-decomposition*.md`.

## Adding a new data layer (pattern)

1. **Migration** `db/migrations/NNN_<name>.sql` — table + GIST index.
2. **Downloader** `scripts/download_<name>_overpass.py` (или аналог).
   Big bbox → grid + dedupe. Save to `data/<name>/`.
3. **Ingest** `pipelines/ingest_<name>.py` — GeoJSON → DB. Idempotent
   по (source, source_version). 100k+ rows → COPY+DELETE через
   `services/geodata/src/geodata/db.py`.
4. **Tile build** `pipelines/build_<name>_tiles.py` — PostGIS → MVT →
   `data/tiles/<name>.pmtiles`. Template: `build_water_tiles.py`.
5. **Frontend** = 1 модуль + 1 запись + 1 чип:
   - `apps/web/src/components/mapView/layers/<name>.ts` — экспорт
     `add<Name>Layer(map)` + `set<Name>Visibility(map, visible)`.
   - `apps/web/src/components/mapView/registry.ts` — entry с
     `pmtiles`, `missingMsg`, `add`, `setVisibility`, `sources`,
     `layers`. `useMapLayers` подхватит автоматически.
   - `apps/web/src/components/mapView/LayerGrid.tsx` — чип в
     `primaryChips` или `secondaryChips`.
   - `apps/web/src/store/useLayerVisibility.ts` — ключ в `LayerKey`
     union + дефолты в `DEFAULT_VISIBLE`/`DEFAULT_LOADED`.
   - `apps/web/src/components/mapView/layerDescriptions.ts` —
     `{title, body}` для нового ключа (TS-обязательно).
   Никаких правок в `MapView.tsx` или хуках.

Python normalize должен оставаться тонким. Если профайлинг показывает
shapely/wkt/area в hot path — push в SQL (см. rosleshoz WKB
pass-through как пример).

## VK photo classification pipeline

`pipelines/ingest_vk.py` — четыре стадии (`collect`, `dates`, `photos`,
`promote` — последний deprecated, см. ниже), запускаются последовательно
или по `--step`.

```bash
# Full pipeline
.venv/Scripts/python.exe -u pipelines/ingest_vk.py --group grib_spb --region lenoblast

# Single stage
.venv/Scripts/python.exe -u pipelines/ingest_vk.py --group grib_spb --region lenoblast --step photos

# Random-sample report (HTML)
.venv/Scripts/python.exe pipelines/vk_photos_report.py --limit 500 --random --out report.html
```

**Model & workers:**
- Model: `qwen/qwen3.5-9b` через LM Studio на `localhost:1234`. Default,
  no `--model` флаг.
- Workers: `--workers 5` (default). LM Studio: **Parallel = 5** для
  загруженной модели.
- Thinking disabled: `chat_template_kwargs.enable_thinking=False` в
  `_ask_model`. Префикс `/no_think` через LM Studio недостаточен.
- `PHOTO_PROMPT_VERSION` controls reprocessing: code-version != DB-version
  → photos_stage прогоняет всё.

**Prompt + JSON Schema:** `pipelines/prompts/vk_classify_v13.txt` +
`vk_classify_schema_v13.json`. Новая версия → создать
`vk_classify_v14.{txt,json}`, обновить `PHOTO_PROMPT_VERSION` и пути
в `ingest_vk.py` (две строки).

**Current prompt:** `v13-birch-strict-pine-softer-2026-04-24`. Эволюция
v7→v13 — в git log на `pipelines/prompts/`.

**CLASSIFY_SCHEMA species enum (18 ключей):**
```
porcini, pine_bolete,
aspen_bolete, birch_bolete, mokhovik,
chanterelle,
saffron_milkcap, white_milkcap, woolly_milkcap,
spring_mushroom, honey_fungus, oyster, russula, fly_agaric,
blueberry, cloudberry, cranberry,
other
```

**GROUP_TO_SLUGS** (что промоутится в species table):
| key | slugs |
|---|---|
| porcini / pine_bolete | boletus-edulis (one slug, разделение для статистики) |
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
| blueberry / cloudberry / cranberry | (нет маппинга — в отчёты, не в species) |

**Key prompting rules:**
- `porcini` = default для любого белого с коричневой шляпой.
  `pine_bolete` только если шляпа UNMISTAKABLY very dark.
- `chanterelle` = все лисички (обычная / трубчатая / вороночник).
  Один ключ — один entry с суммой.
- До 6 фото на пост (равномерно если > 6), иначе все.
- `max_tokens = 1000`, schema-constrained JSON.

## Rules of engagement for changes

**Process:**
- **Verify root cause before iterating.** `curl -I <url>` first when
  network resource implicated. Не переписывать basemap по 7 раз без
  одного HEAD-проверки.
- **Don't add fallbacks on fallbacks.** Fix the fetch, не стак
  «попробуй это, потом то» — это прячет root cause и создаёт fragile
  matrices.
- **Respect git history.** `git log --oneline -20` в начале сессии —
  story is in the commits.
- **Match the existing style of the file**, even если бы я делал иначе
  в fresh project. Consistency inside one repo > global consistency
  with my preferences.
- **Every changed line должен trace to user's request.** Cleanup /
  rename / refactor без запроса — вырезать, спрашивать.
- **State assumptions explicitly.** Ambiguous request → одной
  фразой назвать что неясно + выбрать направление. Не silently guess,
  не freeze ища спек.

**Project-specific facts:**
- **Scheme/hybrid basemap tiles**: `tiles.openfreemap.org` и
  `basemaps.cartocdn.com/rastertiles/*` unreachable из этой сети.
  `server.arcgisonline.com` и `tiles.versatiles.org` работают. Текущий
  выбор — Versatiles Colorful, патч в-app для sprite-array и text-size.
- **Hybrid mode** = Versatiles Colorful + ESRI satellite raster внизу
  + удалены все fill-слои (line + symbol только). Патч —
  `buildHybridStyle()` в `mapView/styles/hybrid.ts`.
- **Forest layer z-order**: forest-fill вставляется перед первым
  symbol-слоем (`findFirstSymbolLayerId`) → labels сверху. Та же
  pattern для water/oopt overlays.

## Gotchas you will hit

- **Forest PMTiles ~318 MB.** Намеренно после 2.17M полигонов и
  rescrape z=10+z=11. Range requests держат браузер быстрым.
- **setStyle() очищает custom sources.** Каждый basemap-switch убивает
  forest/water/oopt/roads. `useBaseMap` re-add'ит после `styledata`.
- **MapLibre `styledata` стреляет multiple times** во время load (per
  sub-resource). Всегда guard `m.isStyleLoaded()` внутри handler'а.
- **MapLibre `load` event может никогда не выстрелить** если внешние
  тайлы тормозят. Используй `styledata + isStyleLoaded()` как «ready»,
  не `load`.
- **Layer toggles во время basemap-switch** = race. Handler должен
  `m.once("idle", ...)` если `!m.isStyleLoaded()`, иначе новый стиль
  смоет свежедобавленный слой.
- **Species search 500** в браузере читается как CORS error — FastAPI
  не приклеивает CORS headers к error-responses. См.
  `docker compose logs api` для реального exception.
