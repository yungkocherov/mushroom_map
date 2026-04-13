"""
Build vector tiles (PMTiles) for the forest layer.

Pipeline:
    1. psql -c "COPY (SELECT id, dominant_species, source, confidence, geometry
                      FROM forest_unified
                      WHERE region_id = :rid)
                TO STDOUT WITH (FORMAT CSV)"  → GeoJSON via ogr2ogr
    2. tippecanoe -o forest.pmtiles -l forest --minimum-zoom 6 --maximum-zoom 14 \\
         --drop-densest-as-needed --extend-zooms-if-still-dropping forest.geojson
    3. move to data/tiles/forest.pmtiles
"""

from __future__ import annotations

import argparse


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--region", required=True)
    parser.add_argument("--minzoom", type=int, default=6)
    parser.add_argument("--maxzoom", type=int, default=14)
    args = parser.parse_args()

    print(f"[phase 2] build_tiles region={args.region} z=[{args.minzoom}..{args.maxzoom}]")
    raise SystemExit("Implemented in phase 2.")


if __name__ == "__main__":
    main()
