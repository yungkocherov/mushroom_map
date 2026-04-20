# CLAUDE.md — project context for Claude Code sessions

This file is auto-loaded at the start of every session. It contains the
durable conventions, commands, and known gotchas. For architecture see
`docs/architecture.md`; for roadmap see `docs/roadmap_content_ideas.md`;
for why we ended up with Rosleshoz see `docs/forest_sources_analysis.md`.

## One-line summary

Interactive mushroom map for Leningrad Oblast. PostGIS + FastAPI + React
+ MapLibre GL + PMTiles. Forest polygons from Rosleshoz/ФГИСЛК (~2M,
full LoO coverage 27.8-36.0°E), painted by dominant tree species /
bonitet / age group; click → popup with bonitet/timber_stock/age_group +
fungi theoretical from species registry.

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
- **Vite HMR on Docker + Windows needs polling**: `vite.config.ts` has
  `watch: { usePolling: true, interval: 300 }`. If file changes don't
  reload, verify that config is intact.
- **Web npm packages must be installed inside the container.** The web
  service uses an anonymous volume `/app/node_modules` (docker-compose.yml)
  that shadows the host bind-mount. Host-side `npm install` updates
  package.json but does not reach the running container. Use:
  `docker compose exec web npm install <pkg>`. Rebuild (`docker compose
  build web`) when you want a clean node_modules baked into the image.
- **PMTiles Range requests** go direct to API (`http://${API_ORIGIN}/tiles/...`),
  not through Vite proxy. Vite proxy doesn't handle Range well.

## Common commands

```bash
# Bring up the stack
docker compose --profile full up -d

# DB only (for local API/web dev)
docker compose up -d db

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

# Re-extract geojson from cached FGIS LK vector tiles
.venv/Scripts/python.exe -u pipelines/fgislk_tiles_to_geojson.py \
  --in data/rosleshoz/fgislk_tiles \
  --out data/rosleshoz/fgislk_vydels.geojson

# Typecheck web
cd services/web && export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit

# API container logs (for 500 errors that manifest as CORS in the browser)
docker compose logs --tail 50 api

# Run all tests (smoke API + unit). Smoke skipped if docker not up.
.venv/Scripts/python.exe -m pytest -q
```

## Architecture — the contract

- **`soil_polygon` + `soil_profile` + lookups (`soil_type`, `soil_parent`)**
  — почвенная карта Докучаевского ин-та (1:2.5М, EGRPR/soil-db.ru). Полигоны
  с soil0/1/2/3 (комплекс) и parent1/2 (порода); 9 точечных разрезов в bbox
  ЛО+Карелия с pH/CORG. Слой `soil.pmtiles` (1.9 МБ); endpoint `/api/soil/at`
  возвращает polygon + profile_nearest. Используется как feature-extractor
  для модели в sister-репо `ik_mushrooms_parser`.
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

## Adding a new data layer (pattern)

1. **Migration** `db/migrations/NNN_<name>.sql` — table + GIST index.
2. **Downloader** in `scripts/download_<name>_overpass.py` (or similar).
   If the bbox is big, split into grid + dedupe. Save to `data/<name>/`.
3. **Ingest** `pipelines/ingest_<name>.py` — reads GeoJSON, writes DB.
   Idempotent by (source, source_version). For 100k+ rows use
   `services/geodata/src/geodata/db.py` COPY+DELETE pattern.
4. **Tile build** `pipelines/build_<name>_tiles.py` — PostGIS → MVT →
   `data/tiles/<name>.pmtiles`. Use `build_water_tiles.py` as template.
5. **Frontend** — add `services/web/src/components/mapView/layers/<name>.ts`
   exporting `add<Name>Layer` + `set<Name>Visibility` (use existing layers
   as template). Wire it in `MapView.tsx` via `toggleLayerWithCheck` with
   HEAD check on `/tiles/<name>.pmtiles` for graceful "tiles not built" UX.

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

### Current prompt version: `v9-merge-chanterelle-allphotos-2026-04-19`

History:
- v7: baseline Gemma prompt, 13 species
- v8: Qwen, added mokhovik/pine_bolete/fly_agaric/berries, soft species limit, count cap 150
- v9: merged chanterelle group (trumpet+вороночник→chanterelle), loosened pine_bolete (porcini is default), 6-photo sampling (was 4)

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

