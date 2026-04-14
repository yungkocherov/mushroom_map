# Downloading OOPT (protected areas) data for Russia

## Sources

### 1. oopt.aari.ru (Arctic and Antarctic Research Institute)

The AARI OOPT portal provides boundary data for Russian protected areas with GeoJSON downloads per region.

- URL: https://oopt.aari.ru
- Navigate to the region of interest (e.g., Leningradskaya Oblast)
- Download the GeoJSON boundary file for the region

### 2. opendata.gov.ru — Ministry of Natural Resources dataset

Dataset identifier: **7702006717-oopt**

- URL: https://opendata.gov.ru/7702006717-oopt
- Provides a federal-level registry of all OOPT with geometry
- Download the GeoJSON or Shapefile export and convert to GeoJSON if needed

## Saving the file

Place the downloaded file at:

```
data/oopt/oopt_lenoblast.geojson
```

Create the directory first if it does not exist:

```bash
mkdir -p data/oopt
```

## Ingesting into the database

```bash
python pipelines/ingest_oopt.py --region lenoblast --file data/oopt/oopt_lenoblast.geojson
```

Optional flags:

```
--dsn postgresql://user:pass@host:port/db   # override DATABASE_URL
```

## Building the PMTiles file

```bash
python pipelines/build_oopt_tiles.py --region lenoblast
```

Output: `data/tiles/oopt.pmtiles` (zoom 7-13, source-layer: `oopt`)

## Properties exposed in the MVT layer

| field           | type    | description                                         |
|-----------------|---------|-----------------------------------------------------|
| `name`          | String  | Name of the protected area                         |
| `oopt_category` | String  | `zapovednik`, `nat_park`, `prirodny_park`, `zakaznik`, `pamyatnik`, or `other` |
| `federal`       | Number  | `1` if federal-level, `0` if regional              |
