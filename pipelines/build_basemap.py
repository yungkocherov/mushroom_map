"""build_basemap.py — собирает basemap-lo.pmtiles через planetiler.

Phase 2.3b. Использует planetiler в режиме openmaptiles-profile —
выдаёт стандартную OpenMapTiles-схему vector tiles (water, waterway,
place, transportation, transportation_name, building, landuse,
landcover, boundary, mountain_peak, park, poi, housenumber).

Pipeline:
1. planetiler сам скачает Geofabrik extract russia/northwestern-fed-district
   в data/planetiler-cache/sources/ (~250 МБ).
2. planetiler.jar отгенерит data/tiles/basemap-lo.pmtiles
   (полный extract с z=0..14).
3. pmtiles extract --maxzoom=10 --bbox=LO_BBOX обрежет до z=6..10
   bundled-version (~30-50 МБ ожидаемых) — apps/mobile/assets/.

Запуск:
    PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe -u pipelines/build_basemap.py

Опции:
    --skip-full-build    использовать существующий basemap-lo.pmtiles full-build
    --max-zoom N         override (default 10 for bundled)
    --osm-area NAME      override (default 'russia/northwestern-fed-district')

Зависимости:
    JDK 17+ на PATH (или JAVA_HOME)
    planetiler.jar (рекомендация: v0.7.0 для Java 17, v0.8+ требует Java 21)
    pmtiles CLI на PATH
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

LO_BBOX = "27.8,58.5,33.0,61.8"  # west,south,east,north — Ленобласть


def find_java() -> str:
    java = shutil.which("java") or os.environ.get("JAVA")
    if java:
        return java
    java_home = os.environ.get("JAVA_HOME")
    if java_home:
        candidate = Path(java_home) / "bin" / ("java.exe" if os.name == "nt" else "java")
        if candidate.exists():
            return str(candidate)
    sys.exit("java not found — JDK 17+ нужен на PATH или JAVA_HOME")


def find_planetiler() -> Path:
    candidates = [
        Path.home() / "bin" / "planetiler.jar",
        Path.home() / ".local" / "share" / "planetiler.jar",
        Path("planetiler.jar"),
    ]
    for c in candidates:
        if c.exists():
            return c
    sys.exit(
        "planetiler.jar not found. Скачай из "
        "https://github.com/onthegomap/planetiler/releases (для Java 17 — v0.7.0) "
        f"в один из: {[str(c) for c in candidates]}"
    )


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--full-output",
        type=Path,
        default=Path("data/tiles/basemap-lo.pmtiles"),
    )
    p.add_argument(
        "--bundled-output",
        type=Path,
        default=Path("apps/mobile/assets/basemap-lo-low.pmtiles"),
    )
    p.add_argument("--skip-full-build", action="store_true")
    p.add_argument("--max-zoom", type=int, default=10)
    p.add_argument(
        "--osm-url",
        default="https://download.geofabrik.de/russia/northwestern-fed-district-latest.osm.pbf",
        help="Direct OSM extract URL (Geofabrik or другой)",
    )
    args = p.parse_args()

    java = find_java()
    jar = find_planetiler()

    if not args.skip_full_build:
        cache_dir = Path("data/planetiler-cache")
        cache_dir.mkdir(parents=True, exist_ok=True)
        args.full_output.parent.mkdir(parents=True, exist_ok=True)

        cmd = [
            java,
            "-Xmx4g",
            "-jar",
            str(jar),
            "--download",
            f"--osm-url={args.osm_url}",
            f"--bounds={LO_BBOX}",
            f"--output={args.full_output}",
            f"--data-dir={cache_dir}",
            "--force",
        ]
        print("running planetiler:", " ".join(cmd), flush=True)
        proc = subprocess.run(cmd)
        if proc.returncode != 0:
            sys.exit(f"planetiler exit {proc.returncode}")

    if not args.full_output.exists():
        sys.exit(f"full output {args.full_output} missing")
    full_size = args.full_output.stat().st_size / (1024 * 1024)
    print(f"full basemap: {full_size:.1f} МБ", flush=True)

    # Bundled-low: trim to maxzoom=10 (ну и то же bbox для верности)
    args.bundled_output.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "pmtiles",
        "extract",
        str(args.full_output),
        str(args.bundled_output),
        "--bbox", LO_BBOX,
        "--maxzoom", str(args.max_zoom),
    ]
    print("trimming:", " ".join(cmd), flush=True)
    proc = subprocess.run(cmd)
    if proc.returncode != 0:
        sys.exit(f"pmtiles extract exit {proc.returncode}")

    bundled_size = args.bundled_output.stat().st_size / (1024 * 1024)
    print(
        f"OK: bundled basemap = {bundled_size:.1f} МБ -> {args.bundled_output}",
        flush=True,
    )


if __name__ == "__main__":
    main()
