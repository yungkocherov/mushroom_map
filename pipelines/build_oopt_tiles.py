"""
build_oopt_tiles: generate oopt.pmtiles from the protected_area table.

Usage:
    python pipelines/build_oopt_tiles.py --region lenoblast
    python pipelines/build_oopt_tiles.py --region lenoblast --out data/tiles/oopt.pmtiles
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
DEFAULT_EXTENT  = 4096
DEFAULT_BUFFER  = 64
DEFAULT_REGION  = "lenoblast"




def build_tile_bytes(
    conn: psycopg.Connection,
    z: int, x: int, y: int,
    extent: int,
    buffer: int,
) -> bytes | None:
    row = conn.execute(
        """
        WITH mvt_src AS (
            SELECT
                p.name,
                p.oopt_category,
                (p.federal::int) AS federal,
                ST_AsMVTGeom(
                    ST_Transform(p.geometry, 3857),
                    ST_TileEnvelope(%s, %s, %s),
                    %s, %s, true
                ) AS geom
            FROM protected_area p
            WHERE ST_Transform(p.geometry, 3857) && ST_TileEnvelope(%s, %s, %s)
        )
        SELECT ST_AsMVT(mvt_src, 'oopt', %s, 'geom')
        FROM mvt_src
        WHERE geom IS NOT NULL
        """,
        (z, x, y, extent, buffer, z, x, y, extent),
    ).fetchone()
    if row is None or row[0] is None or len(row[0]) == 0:
        return None
    return gzip.compress(bytes(row[0]))


def main() -> None:
    ap = argparse.ArgumentParser(description="Build oopt.pmtiles from protected_area table")
    ap.add_argument("--region",  default=DEFAULT_REGION)
    ap.add_argument("--minzoom", type=int, default=DEFAULT_MINZOOM)
    ap.add_argument("--maxzoom", type=int, default=DEFAULT_MAXZOOM)
    ap.add_argument("--out",     default="data/tiles/oopt.pmtiles")
    ap.add_argument("--extent",  type=int, default=DEFAULT_EXTENT)
    ap.add_argument("--buffer",  type=int, default=DEFAULT_BUFFER)
    args = ap.parse_args()

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = out_path.with_suffix(".pmtiles.tmp")

    dsn = build_dsn()
    print(f"DB: {dsn[:60]}...")
    print(f"region={args.region} zoom={args.minzoom}..{args.maxzoom} out={out_path}")

    with psycopg.connect(dsn, autocommit=True) as conn:
        bbox = region_bbox(conn, args.region)
        min_lon, min_lat, max_lon, max_lat = bbox
        print(f"bbox: {bbox}")

        n_rows = conn.execute("SELECT COUNT(*) FROM protected_area").fetchone()[0]
        print(f"protected_area rows: {n_rows}")

        t0 = time.monotonic()
        written   = 0
        total_size = 0

        with open(tmp_path, "wb") as f:
            writer = Writer(f)

            for z in range(args.minzoom, args.maxzoom + 1):
                x0, y0 = lonlat_to_tile(max_lat, min_lon, z)
                x1, y1 = lonlat_to_tile(min_lat, max_lon, z)
                x_min, x_max = min(x0, x1), max(x0, x1)
                y_min, y_max = min(y0, y1), max(y0, y1)
                n_tiles = (x_max - x_min + 1) * (y_max - y_min + 1)
                print(f"\n  z={z:<2d} ({n_tiles} tiles)")

                z_ok = 0
                t_z  = time.monotonic()

                for x in range(x_min, x_max + 1):
                    for y in range(y_min, y_max + 1):
                        data = build_tile_bytes(conn, z, x, y, args.extent, args.buffer)
                        if data is None:
                            continue
                        writer.write_tile(zxy_to_tileid(z, x, y), data)
                        z_ok      += 1
                        total_size += len(data)
                        written   += 1

                dt = time.monotonic() - t_z
                print(f"     done: ok={z_ok} ({n_tiles / max(dt, 0.001):.0f} tile/s, {dt:.1f}s)")

            header = {
                "version": 3,
                "tile_type": TileType.MVT,
                "tile_compression": Compression.GZIP,
                "min_zoom": args.minzoom,
                "max_zoom": args.maxzoom,
                "min_lon_e7": int(min_lon * 1e7),
                "min_lat_e7": int(min_lat * 1e7),
                "max_lon_e7": int(max_lon * 1e7),
                "max_lat_e7": int(max_lat * 1e7),
                "center_zoom": max(args.minzoom, (args.minzoom + args.maxzoom) // 2),
                "center_lon_e7": int((min_lon + max_lon) / 2 * 1e7),
                "center_lat_e7": int((min_lat + max_lat) / 2 * 1e7),
            }
            metadata = {
                "name": f"mushroom-map oopt {args.region}",
                "vector_layers": [{
                    "id": "oopt",
                    "fields": {
                        "name":          "String",
                        "oopt_category": "String",
                        "federal":       "Number",
                    },
                    "minzoom": args.minzoom,
                    "maxzoom": args.maxzoom,
                }],
            }
            writer.finalize(header, metadata)

        tmp_path.replace(out_path)
        elapsed = time.monotonic() - t0
        size_mb = out_path.stat().st_size / 1024 / 1024
        print(f"\ndone: {written} tiles, {size_mb:.1f} MB, {elapsed:.1f}s")


if __name__ == "__main__":
    main()
