---
name: forest-point-verify
description: Use when user gives lat/lon coords on Geobiom/mushroom-map and reports "цвет неправильный", "пусто", "темный", "дубль" etc. Runs SQL diagnostic on forest_polygon table to find polygons containing each point, plus dedup-key and ratio fields, and identifies which class of bug it is (bogus inflate / overlap dup / gap / legit edge case).
---

# Diagnose user-reported color/coverage issues on Geobiom map

When user pastes coordinates like `60.65413, 29.22922` (lat first, then lon) for points where the forest layer looks wrong, run this SQL against the dev `forest_polygon`. Order: lat, lon.

## Step 1 — diagnostic SQL

For each user-given point, find all polygons containing it + their dedup-key + ratio:

```bash
docker exec mushroom_db psql -U mushroom -d mushroom_map -c "
SELECT pts.pid, fp.source_feature_id, fp.dominant_species,
  (fp.meta->>'formula') AS formula,
  round((ST_Area(fp.geometry::geography)/10000)::numeric, 2) AS real_ha,
  (fp.meta->>'square_ha')::float AS fgis_ha,
  round(((ST_Area(fp.geometry::geography)/10000.0) / NULLIF((fp.meta->>'square_ha')::float, 0))::numeric, 2) AS ratio,
  FLOOR(ST_X(ST_Centroid(fp.geometry)) / 0.0001)::bigint AS cx10m,
  FLOOR(ST_Y(ST_Centroid(fp.geometry)) / 0.0001)::bigint AS cy10m,
  ROUND((LN(GREATEST(ST_Area(fp.geometry::geography), 1)) * 100)::numeric)::int AS bkt,
  md5(ST_AsBinary(fp.geometry)) AS raw_hash
FROM (VALUES
  -- ВНИМАНИЕ: ST_MakePoint(lon, lat), не lat-lon!
  (1, ST_SetSRID(ST_MakePoint(LON, LAT), 4326))
) AS pts(pid, geom)
JOIN forest_polygon fp ON fp.source='rosleshoz' AND ST_Contains(fp.geometry, pts.geom)
ORDER BY pts.pid, real_ha DESC;
"
```

If `JOIN` returns empty for a point — check radius:

```sql
SELECT (SELECT count(*) FROM forest_polygon
        WHERE source='rosleshoz'
          AND ST_DWithin(geometry::geography, pts.geom::geography, 500)) AS within_500m,
       (SELECT round(ST_Distance(geometry::geography, pts.geom::geography)::numeric, 0)
        FROM forest_polygon WHERE source='rosleshoz'
        ORDER BY geometry <-> pts.geom LIMIT 1) AS nearest_m
FROM (VALUES (ST_SetSRID(ST_MakePoint(LON, LAT), 4326))) AS pts(geom);
```

## Step 2 — classify the bug

Based on output, identify which of these classes the user is hitting:

| Symptom | Diagnosis | Fix layer |
|---|---|---|
| `n=2+` rows for one point, all `dominant_species` differ, `ratio` ~1 | Two real adjacent vydels with shared border | Not a bug |
| `n=2+` rows, identical real_ha, identical raw_hash | Byte-identical geometry dup (same WMS contour for two oid) | `db.py::_INSERT_SQL` DISTINCT ON md5 (already covered by 10m-grid+bucket key) |
| `n=2+` rows, identical cx10m+cy10m+bkt, different raw_hash | "Almost identical" contour with vertex chain rounding | DISTINCT ON `(cx10m, cy10m, bkt)` — already in `_INSERT_SQL` |
| `n=1` row but `ratio > 3` | bogus inflate (WMS returned quarter contour) | `scrape_fgislk_attrinfo.py::_geom_passes_sanity` — already filters new scrapes; old `progress.db` rows blocked by `_INSERT_SQL` WHERE clause |
| `n=0`, `within_500m=0`, `nearest_m > 200` | Discovery bbox gap — region not covered by MVT discovery | Re-run `pipelines/discover_oids_from_mvt.py --bbox <wider>` |
| `n=0`, `within_500m > 0`, `nearest_m < 100` | Quarter-fill gap — specific oid not in MVT, missed by cluster-fill | Per-quarter cluster-fill candidate generation needs wider gap (`gap=2000`) |

## Step 3 — for gap diagnosis, check MVT/progress.db

```python
# /c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe
import sqlite3
mvt = sqlite3.connect(r'C:\Users\ikoch\mushroom-map\data\rosleshoz\mvt_oid_full_lo.db')
prog = sqlite3.connect(r'C:\Users\ikoch\mushroom-map\data\rosleshoz\fgislk_attrinfo_progress.db')

# Per region prefix coverage
for r in mvt.execute("""SELECT substr(externalid, 1, 5), count(*)
                        FROM oids WHERE externalid LIKE '47:%' GROUP BY 1 ORDER BY 2 DESC"""):
    print(r)
# A region with <50k oids is a discovery gap (47:18 should have ~140k, 47:9 ~100k, etc).
```

## Reference files

- Scraper: `pipelines/scrape_fgislk_attrinfo.py`
- Ingest dedup: `services/geodata/src/geodata/db.py::_INSERT_SQL`
- MVT discovery: `pipelines/discover_oids_from_mvt.py`
- Project gotchas list: `CLAUDE.md` "Gotchas you will hit" section
