"""
build_protective_tiles: generate PMTiles for protective_forest layer.

Usage:
    python pipelines/build_protective_tiles.py --region lenoblast
"""

from __future__ import annotations

import argparse
import gzip
import time
from pathlib import Path

import psycopg
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer

from tile_utils import build_dsn, lonlat_to_tile, region_bbox

DEFAULT_MINZOOM = 7
DEFAULT_MAXZOOM = 13
DEFAULT_EXTENT = 4096
DEFAULT_BUFFER = 64
DEFAULT_REGION = "lenoblast"




def prepare_projected_source(conn):
    conn.execute("DROP TABLE IF EXISTS protective_3857")
    conn.execute(
        """
        CREATE TEMP TABLE protective_3857 AS
        SELECT externalid, protect_type, area_m2,
               ST_Transform(geometry, 3857) AS geom
        FROM protective_forest
        """
    )
    conn.execute("CREATE INDEX idx_protective_3857_gix ON protective_3857 USING GIST (geom)")
    conn.execute("CLUSTER protective_3857 USING idx_protective_3857_gix")
    conn.execute("ANALYZE protective_3857")


def build_tile_bytes(conn, z, x, y, extent, buffer):
    row = conn.execute(
        """
        WITH mvt_src AS (
            SELECT externalid, protect_type, area_m2,
                   ST_AsMVTGeom(p.geom, ST_TileEnvelope(%s, %s, %s), %s, %s, true) AS geom
            FROM protective_3857 p
            WHERE p.geom && ST_TileEnvelope(%s, %s, %s)
        )
        SELECT ST_AsMVT(mvt_src, 'protective', %s, 'geom')
        FROM mvt_src WHERE geom IS NOT NULL
        """,
        (z, x, y, extent, buffer, z, x, y, extent),
    ).fetchone()
    if row is None or row[0] is None or len(row[0]) == 0:
        return None
    return gzip.compress(bytes(row[0]))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", default=DEFAULT_REGION)
    ap.add_argument("--minzoom", type=int, default=DEFAULT_MINZOOM)
    ap.add_argument("--maxzoom", type=int, default=DEFAULT_MAXZOOM)
    ap.add_argument("--out", default="data/tiles/protective.pmtiles")
    ap.add_argument("--extent", type=int, default=DEFAULT_EXTENT)
    ap.add_argument("--buffer", type=int, default=DEFAULT_BUFFER)
    args = ap.parse_args()

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = out_path.with_suffix(".pmtiles.tmp")

    dsn = build_dsn()
    print(f"region={args.region} zoom={args.minzoom}..{args.maxzoom} out={out_path}")

    with psycopg.connect(dsn, autocommit=True) as conn:
        bbox = region_bbox(conn, args.region)
        min_lon, min_lat, max_lon, max_lat = bbox
        n_rows = conn.execute("SELECT COUNT(*) FROM protective_forest").fetchone()[0]
        print(f"protective_forest rows: {n_rows}")
        prepare_projected_source(conn)

        t0 = time.monotonic()
        written = 0
        with open(tmp_path, "wb") as f:
            writer = Writer(f)
            for z in range(args.minzoom, args.maxzoom + 1):
                x0, y0 = lonlat_to_tile(max_lat, min_lon, z)
                x1, y1 = lonlat_to_tile(min_lat, max_lon, z)
                x_min, x_max = min(x0, x1), max(x0, x1)
                y_min, y_max = min(y0, y1), max(y0, y1)
                n_tiles = (x_max - x_min + 1) * (y_max - y_min + 1)
                print(f"  z={z}  {n_tiles} tiles", flush=True)
                t_z = time.monotonic()
                z_ok = 0
                for x in range(x_min, x_max + 1):
                    for y in range(y_min, y_max + 1):
                        data = build_tile_bytes(conn, z, x, y, args.extent, args.buffer)
                        if data is None:
                            continue
                        writer.write_tile(zxy_to_tileid(z, x, y), data)
                        z_ok += 1
                        written += 1
                print(f"     ok={z_ok} in {time.monotonic()-t_z:.1f}s", flush=True)

            header = {
                "version": 3, "tile_type": TileType.MVT, "tile_compression": Compression.GZIP,
                "min_zoom": args.minzoom, "max_zoom": args.maxzoom,
                "min_lon_e7": int(min_lon * 1e7), "min_lat_e7": int(min_lat * 1e7),
                "max_lon_e7": int(max_lon * 1e7), "max_lat_e7": int(max_lat * 1e7),
                "center_zoom": max(args.minzoom, (args.minzoom + args.maxzoom) // 2),
                "center_lon_e7": int((min_lon + max_lon) / 2 * 1e7),
                "center_lat_e7": int((min_lat + max_lat) / 2 * 1e7),
            }
            metadata = {
                "name": f"mushroom-map protective {args.region}",
                "vector_layers": [{
                    "id": "protective",
                    "fields": {"externalid": "String", "protect_type": "String", "area_m2": "Number"},
                    "minzoom": args.minzoom, "maxzoom": args.maxzoom,
                }],
            }
            writer.finalize(header, metadata)

        tmp_path.replace(out_path)
        size_mb = out_path.stat().st_size / 1024 / 1024
        print(f"\ndone: {written} tiles, {size_mb:.1f} MB, {time.monotonic() - t0:.1f}s")


if __name__ == "__main__":
    main()
