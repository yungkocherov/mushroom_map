---
name: deploy-forest-data-to-prod
description: Use after ANY change to forest_polygon (re-scrape FGIS, fix ingest dedup, re-import a region, etc) to roll the new data to production. Five-step pipeline — local rebuild + sync tiles + sync DB + verify endpoint + visual smoke. The critical gotcha: tiles AND DB must both be synced. Tiles serve the visual layer; API hits a separate prod-DB on TimeWeb. Forgetting DB sync → popup stays «Вне лесных полигонов» even though forest is visible on the map.
---

# Deploy forest data changes to geobiom.ru

Production runs **two stacks** with **two separate stores** for forest data:
- `forest.pmtiles` — static file at `/srv/mushroom-map/tiles/forest.pmtiles` on TimeWeb. Drives the **visual** layer (vector tiles via HTTP Range).
- `forest_polygon` table in `mushroom_db_prod` (PostgreSQL container on TimeWeb). Drives the **API** (`/api/forest/at?lat=&lon=` for popup, `/api/species/...`, etc).

After a local DB change, **both must be re-synced**. Skipping DB sync is the most common mistake — visual tiles update, but clicks still return `forest:null`.

## Pre-flight (1 line each, fast)

```bash
# Scope of change — is forest_polygon really updated locally?
docker exec mushroom_db psql -U mushroom -d mushroom_map -c \
  "SELECT source, source_version, count(*) FROM forest_polygon WHERE source='rosleshoz' GROUP BY 1,2;"

# Egress estimate (free-tier discipline). Each step is roughly:
#   - tile build: 0 net (local)
#   - tile sync: pmtiles size (currently ~510MB) ONE-WAY upload to TimeWeb
#   - DB sync: COMPRESSED CSV ~1-2 GB upload + DELETE+COPY in prod docker
# Total egress per deploy ~1.5-2.5 GB. Under TimeWeb panel quota easily.
```

## Step 1 — rebuild forest.pmtiles locally

```bash
cd /c/Users/ikoch/mushroom-map && (bash pipelines/build_forest_tiles.sh \
    > logs/build_forest.log 2>&1; echo "BUILD_DONE exit=$?" >> logs/build_forest.log)
# run_in_background:true. ~3-5 min.
# Pipeline: psql dump → tippecanoe → pmtiles convert (atomic rename).
# Output: data/tiles/forest.pmtiles (~510MB at current scale).
```

Monitor with `tail -F logs/build_forest.log | grep -E "BUILD_DONE|Error|done:"`.

## Step 2 — sync tiles to TimeWeb

```bash
cd /c/Users/ikoch/mushroom-map && (bash scripts/deploy/sync_tiles_to_vm.sh forest \
    > logs/sync_tiles.log 2>&1; echo "SYNC_TILES_DONE exit=$?" >> logs/sync_tiles.log)
# rsync forest.pmtiles → geobiom-prod-timeweb:/srv/mushroom-map/tiles/. ~1-3 min.
```

Verify after:

```bash
curl -sI https://api.geobiom.ru/tiles/forest.pmtiles 2>&1 | grep -iE "last-modified|content-length"
# Last-Modified должен быть свежий (только что), Content-Length matches local file.
```

## Step 3 — sync forest_polygon DB to TimeWeb (DON'T SKIP)

```bash
cd /c/Users/ikoch/mushroom-map && (REMOTE=geobiom-prod-timeweb \
    bash scripts/deploy/sync_forest_polygon_to_remote.sh \
    > logs/sync_db.log 2>&1; echo "SYNC_DB_DONE exit=$?" >> logs/sync_db.log)
# Pipeline:
#   [1/5] psql COPY (local docker) → CSV  
#   [2/5] gzip + scp → /tmp on remote
#   [3/5] gunzip + docker cp into prod container
#   [4/5] BEGIN; DELETE FROM forest_polygon WHERE source='rosleshoz';
#                COPY forest_polygon FROM '/tmp/...'; COMMIT  (transactional)
#   [5/5] cleanup remote+local
# ~5-15 min total.
```

Monitor with `tail -F logs/sync_db.log | grep -E "\[[0-9]+/5\]|SYNC_DB_DONE|Error"`.

The script **only touches `WHERE source='rosleshoz'`** (atomic DELETE+COPY in transaction). Won't wipe `user_spot`, `oauth_user`, or other tables. If you need a different source filter, set `SOURCE=...` env var (or `''` for all).

## Step 4 — verify the API endpoint matches your change

Hit the prod API directly — bypasses any browser/CDN cache:

```bash
# Example: previously broken point, now should return forest data
curl -s 'https://api.geobiom.ru/api/forest/at?lat=58.84359&lon=29.30254' | head
# Expect: {"forest":{"dominant_species":"pine", "age_group":"спелые", ...}, ...}
# NOT: {"forest":null, ...}
```

Cross-check directly in prod DB:

```bash
ssh geobiom-prod-timeweb "docker exec mushroom_db_prod psql -U mushroom -d mushroom_map -c \
  \"SELECT count(*) FROM forest_polygon WHERE source='rosleshoz';\""
# Should match local count.
```

## Step 5 — visual smoke via Chrome MCP

```
URL: https://geobiom.ru/?lat=<your_test_lat>&lon=<your_test_lon>&z=15
```

Hard-reload (Ctrl+Shift+R) to bust browser cache, click on test points, verify popups show fresh data. Both content (species/age/bonitet) AND position (popup at click point, not flying off-screen).

## Common mistakes (debug guide)

| Symptom | Cause | Fix |
|---|---|---|
| Popup says «Вне лесных полигонов» but DB has the polygon | Skipped step 3 (DB not synced) | Run step 3 |
| forest layer rendering empty / stale on map | Skipped step 2 OR browser cache | Step 2 + hard-reload |
| Caddy serves zero-byte file | `build_forest_tiles.sh` failed mid-convert; `mv -f` overwrote with broken tmp | Re-run step 1 (atomic rename guard means old file stayed valid before, but if interrupted between steps re-build) |
| `mushroom_db_prod` collation warnings | Pre-existing libc 2.31 vs 2.36 mismatch on TimeWeb VM. Non-blocking. | Ignore, or `ALTER DATABASE REFRESH COLLATION VERSION` (separate task) |
| Mobile users still see old data on overview zooms (z=5..8) | mobile pre-2026-05 builds still fetch `forest_lo.pmtiles` separately. Forest_lo no longer rebuilt. | After mobile redeploys propagate, delete `/srv/mushroom-map/tiles/forest_lo.pmtiles`. See `project_todo_prod_cleanup.md`. |

## Free-tier discipline

Per `CLAUDE.md`: never exceed free-tier ≥30%. This deploy:
- TimeWeb egress: ~1.5-2.5 GB per cycle. Under quota.
- Oracle: not touched (Oracle replica syncs from TimeWeb nightly via `sync_db_timeweb_to_oracle.sh`).

If doing >3 deploys/day → check `~/.cloudflare/...` and TimeWeb panel for cumulative monthly egress.
