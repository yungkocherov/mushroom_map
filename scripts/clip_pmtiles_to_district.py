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


# Slug -> Russian root для 18 районов LO. SQL'у скармливаем %root% LIKE,
# чтобы прицепиться независимо от падежа («Лужский»/«Лужского»). До
# Phase 2 (отдельный slug-column в admin_area) — самый дешёвый матч.
DISTRICT_SLUG_TO_RU = {
    "vyborg":         "Выборгск",
    "vyborgsky":      "Выборгск",
    "priozersk":      "Приозерск",
    "priozersky":     "Приозерск",
    "vsevolozhsk":    "Всеволожск",
    "vsevolozhsky":   "Всеволожск",
    "luzhsky":        "Лужск",
    "luga":           "Лужск",
    "tikhvin":        "Тихвинск",
    "tikhvinsky":     "Тихвинск",
    "volosovo":       "Волосовск",
    "volosovsky":     "Волосовск",
    "boksitogorsky":  "Бокситогорск",
    "volkhovsky":     "Волховск",
    "tosno":          "Тосненск",
    "tosnensky":      "Тосненск",
    "kirovsky":       "Кировск",
    "slantsy":        "Сланцевск",
    "slantsevsky":    "Сланцевск",
    "kirishi":        "Киришск",
    "kirishsky":      "Киришск",
    "podporozhsky":   "Подпорожск",
    "lodeynopolsky":  "Лодейнопольск",
    "gatchina":       "Гатчинск",
    "gatchinsky":     "Гатчинск",
    "kingisepp":      "Кингисеппск",
    "kingiseppsky":   "Кингисеппск",
    "lomonosov":      "Ломоносовск",
    "lomonosovsky":   "Ломоносовск",
    "sosnovy_bor":    "Сосновоборск",
    "sosnovoborsky":  "Сосновоборск",
}


def get_district_bbox(dsn: str, slug: str) -> tuple[float, float, float, float]:
    """Return (south, west, north, east) for the named district."""
    ru_root = DISTRICT_SLUG_TO_RU.get(slug.lower())
    if ru_root is None:
        sys.exit(
            f"unknown district slug {slug!r}. Known: "
            + ", ".join(sorted(set(DISTRICT_SLUG_TO_RU)))
        )
    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              ST_YMin(ST_Envelope(geometry)),
              ST_XMin(ST_Envelope(geometry)),
              ST_YMax(ST_Envelope(geometry)),
              ST_XMax(ST_Envelope(geometry)),
              name_ru
            FROM admin_area
            WHERE level = 6 AND name_ru ILIKE %s
            ORDER BY ST_Area(geometry::geography) DESC
            LIMIT 1
            """,
            (f"%{ru_root}%",),
        )
        row = cur.fetchone()
        if not row:
            sys.exit(
                f"district matching root {ru_root!r} not found in admin_area "
                f"(level=6). Did you run pipelines/ingest_districts.py?"
            )
        print(f"matched district: {row[4]}", flush=True)
        return (row[0], row[1], row[2], row[3])


def clip(in_path: Path, out_path: Path, bbox: tuple[float, float, float, float], buffer_deg: float = 0.05) -> None:
    s, w, n, e = bbox
    s -= buffer_deg
    n += buffer_deg
    w -= buffer_deg
    e += buffer_deg

    if not shutil.which("pmtiles"):
        sys.exit(
            "pmtiles CLI not found in PATH. Download prebuilt binary from "
            "https://github.com/protomaps/go-pmtiles/releases and place "
            "in %USERPROFILE%\\bin\\ (or anywhere on PATH)."
        )

    # pmtiles 1.x extract: subset by bbox in a single pass, no Docker, no
    # tippecanoe. Tiles intersecting bbox are copied wholesale (edge tiles
    # carry features that extend outside the bbox, but MapLibre clips at
    # viewport on the device — fine for our spike).
    subprocess.run(
        [
            "pmtiles", "extract", str(in_path), str(out_path),
            "--bbox", f"{w},{s},{e},{n}",
        ],
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
