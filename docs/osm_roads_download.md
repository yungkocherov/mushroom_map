# Downloading OSM road data for Leningrad Oblast

## Step 1: Download the OSM PBF extract

Download the Leningradskaya Oblast PBF extract from Geofabrik:

- Index page: https://download.geofabrik.de/russia/northwestern-fed-district.html
- Look for **Leningradskaya Oblast** and download the `.osm.pbf` file directly

```bash
wget https://download.geofabrik.de/russia/northwestern-fed-district/leningradskaya-oblast-latest.osm.pbf
```

## Step 2: Install osmium-tool

```bash
# via pip (Python bindings, includes the CLI on most platforms)
pip install osmium

# or via conda-forge (recommended for Windows/macOS)
conda install -c conda-forge osmium-tool
```

## Step 3: Filter road features

Keep only the highway types relevant for mushroom picking (unpaved/off-road routes):

```bash
osmium tags-filter leningradskaya-oblast-latest.osm.pbf \
    w/highway=track,path,footway,bridleway,cycleway \
    -o roads_filtered.osm.pbf
```

## Step 4: Export to GeoJSON

Export only LineString geometries (ways become lines):

```bash
mkdir -p data/osm

osmium export roads_filtered.osm.pbf \
    --geometry-types=linestring \
    -o data/osm/roads_lenoblast.geojson
```

The resulting file will have `highway` and `name` properties on each feature, and `@id` set to `way/<osm_id>`.

## Step 5: Ingest into the database

```bash
python pipelines/ingest_osm_roads.py --region lenoblast
```

Optional flags:

```
--file data/osm/roads_lenoblast.geojson   # default path shown above
--dsn  postgresql://user:pass@host:port/db
```

Only features with `highway` in `track`, `path`, `footway`, `bridleway`, `cycleway` are imported; others are skipped.

## Step 6: Build the PMTiles file

```bash
python pipelines/build_roads_tiles.py --region lenoblast
```

Output: `data/tiles/roads.pmtiles` (zoom 10-14, source-layer: `roads`)

## Properties exposed in the MVT layer

| field     | type   | description                              |
|-----------|--------|------------------------------------------|
| `highway` | String | OSM highway tag value (e.g. `track`)    |
| `name`    | String | Road name if present in OSM, else null  |
