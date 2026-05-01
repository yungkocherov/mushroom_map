"""Clip a PMTiles file to a district bbox.

Phase 0 spike helper for the mobile app. Reads `forest.pmtiles` (or any
PMTiles vector source), pulls the district bbox from `admin_area`, and
runs `tippecanoe` rebuild restricted to that bbox + small buffer so the
mobile spike can bundle a ~25 MB asset instead of 302 MB.

Phase 2 will replace this with `pipelines/build_district_tiles.py` —
proper per-district packaging for download-manager UI. For now this
script is enough to unblock the Phase 0 spike on Лужский район.

Requires:
- tippecanoe + tile-join in PATH (or via klokantech/tippecanoe Docker image)
- pmtiles CLI (`go install github.com/protomaps/go-pmtiles/cmd/pmtiles@latest`)
- Postgres reachable (uses DATABASE_URL or --dsn)
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import psycopg


def get_district_bbox(dsn: str, slug: str) -> tuple[float, float, float, float]:
    """Return (south, west, north, east) for the named district."""
    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        # admin_area.code is like 'osm_rel_<id>'; we don't have a slug
        # column yet (TODO migration in Phase 1). Match by name LIKE for now.
        cur.execute(
            """
            SELECT
              ST_YMin(ST_Envelope(geometry)),
              ST_XMin(ST_Envelope(geometry)),
              ST_YMax(ST_Envelope(geometry)),
              ST_XMax(ST_Envelope(geometry))
            FROM admin_area
            WHERE LOWER(name) LIKE LOWER(%s)
            ORDER BY ST_Area(geometry::geography) DESC
            LIMIT 1
            """,
            (f"%{slug}%",),
        )
        row = cur.fetchone()
        if not row:
            sys.exit(f"district matching {slug!r} not found in admin_area")
        return (row[0], row[1], row[2], row[3])


def clip(in_path: Path, out_path: Path, bbox: tuple[float, float, float, float], buffer_deg: float = 0.05) -> None:
    s, w, n, e = bbox
    s -= buffer_deg
    n += buffer_deg
    w -= buffer_deg
    e += buffer_deg

    if not shutil.which("pmtiles"):
        sys.exit("pmtiles CLI not found in PATH. Install via go install github.com/protomaps/go-pmtiles/cmd/pmtiles@latest")
    if not shutil.which("tile-join"):
        sys.exit("tile-join (tippecanoe) not found in PATH")

    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        mbtiles_in = td_path / "in.mbtiles"
        mbtiles_clip = td_path / "clip.mbtiles"

        # PMTiles -> MBTiles (lossless container swap)
        subprocess.run(
            ["pmtiles", "convert", str(in_path), str(mbtiles_in)],
            check=True,
        )

        # tile-join with bbox restriction does the actual clip
        subprocess.run(
            [
                "tile-join",
                "-o", str(mbtiles_clip),
                "--bounds", f"{w},{s},{e},{n}",
                "--no-tile-size-limit",
                str(mbtiles_in),
            ],
            check=True,
        )

        # MBTiles -> PMTiles
        subprocess.run(
            ["pmtiles", "convert", str(mbtiles_clip), str(out_path)],
            check=True,
        )


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--district", required=True, help="district name slug (e.g. luzhsky, vyborg)")
    p.add_argument("--in", dest="in_path", required=True, type=Path)
    p.add_argument("--out", dest="out_path", required=True, type=Path)
    p.add_argument(
        "--dsn",
        default=os.environ.get(
            "DATABASE_URL",
            "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map",
        ),
    )
    p.add_argument("--buffer-deg", type=float, default=0.05, help="bbox buffer in degrees, default 0.05 (~5 km)")
    args = p.parse_args()

    if not args.in_path.exists():
        sys.exit(f"input file does not exist: {args.in_path}")

    args.out_path.parent.mkdir(parents=True, exist_ok=True)

    bbox = get_district_bbox(args.dsn, args.district)
    print(f"district {args.district!r} bbox: {bbox}", flush=True)

    clip(args.in_path, args.out_path, bbox, args.buffer_deg)

    in_size = args.in_path.stat().st_size / (1024 * 1024)
    out_size = args.out_path.stat().st_size / (1024 * 1024)
    print(
        f"OK: {args.out_path} ({out_size:.1f} MB; was {in_size:.1f} MB, {out_size / in_size * 100:.1f}%)",
        flush=True,
    )


if __name__ == "__main__":
    main()
