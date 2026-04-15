# CLAUDE.md — project context for Claude Code sessions

This file is auto-loaded at the start of every session. It contains the
durable conventions, commands, and known gotchas. For architecture see
`docs/architecture.md`; for roadmap see `docs/roadmap_content_ideas.md`;
for why we ended up with Rosleshoz see `docs/forest_sources_analysis.md`.

## One-line summary

Interactive mushroom map for Leningrad Oblast. PostGIS + FastAPI + React
+ MapLibre GL + PMTiles. Forest polygons from Rosleshoz/ФГИСЛК (~913k),
painted by dominant tree species / bonitet / age group; click → popup
with bonitet/timber_stock/age_group + fungi theoretical from species
registry.

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
```

## Architecture — the contract

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
5. **Frontend** — `MapView.tsx` adds source + layer in `add<Name>Layer`,
   `handle<Name>Toggle` with HEAD check on `/tiles/<name>.pmtiles` before
   loading (graceful error if tiles not built yet).

Python normalize must stay thin. If profiling shows shapely/wkt/area in
the hot path, push them to SQL (see rosleshoz WKB pass-through for how).

## Rules of engagement for changes

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
- **Scheme/hybrid basemap tiles**: `tiles.openfreemap.org` and
  `basemaps.cartocdn.com/rastertiles/*` are unreachable from this
  user's network. `server.arcgisonline.com` and `tiles.versatiles.org`
  work. The current choice is Versatiles Colorful (vector) patched
  in-app for sprite-array and text-size.
- **Hybrid mode** = Versatiles Colorful with ESRI satellite raster
  injected as the bottom layer and all fill layers removed (so only
  line + symbol vector layers draw over the imagery). The patch lives
  in `buildHybridStyle()` in MapView.tsx.
- **Forest layer z-order**: forest-fill is inserted before the first
  symbol layer (`findFirstSymbolLayerId`), so labels stay on top.
  Same pattern for water/oopt overlays.

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
