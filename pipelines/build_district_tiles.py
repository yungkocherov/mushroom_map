"""Per-district PMTiles packages для mobile-app offline-режима.

Phase 2 spec: бьёт data/tiles/{forest,water,waterway,wetlands}.pmtiles
по 18 районам ЛО (admin_area level=6) через `pmtiles extract --bbox`,
складывает в data/tiles/districts/{slug}/{layer}.pmtiles, плюс
генерит manifest data/tiles/regions.json с sha256+size для каждого
файла. `/api/mobile/regions` отдаёт этот manifest mobile-приложению.

Запуск:
    PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe -u pipelines/build_district_tiles.py

Опционально:
    --district <slug>      только один район (для итеративной отладки)
    --layers a,b,c         только указанные слои (default: все 4)
    --buffer-deg 0.05      bbox-padding в градусах (default: 5 км)
    --dry-run              посчитать output-размеры без записи

Зависимости: pmtiles CLI на PATH, psycopg, доступ к Postgres.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

import psycopg


DEFAULT_LAYERS = ["forest", "water", "waterway", "wetlands"]


def get_districts(dsn: str) -> list[tuple[str, str, tuple[float, float, float, float]]]:
    """Return (slug, name_ru, bbox) for all 18 LO districts."""
    sql = """
        SELECT
          slug,
          name_ru,
          ST_YMin(ST_Envelope(geometry)) AS s,
          ST_XMin(ST_Envelope(geometry)) AS w,
          ST_YMax(ST_Envelope(geometry)) AS n,
          ST_XMax(ST_Envelope(geometry)) AS e
        FROM admin_area
        WHERE level = 6 AND slug IS NOT NULL
        ORDER BY slug
    """
    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute(sql)
        rows = cur.fetchall()
    return [(slug, name, (s, w, n, e)) for slug, name, s, w, n, e in rows]


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def is_clustered(path: Path) -> bool:
    """`pmtiles extract` требует clustered=true. Проверяем через
    `pmtiles show`, ищем строку «clustered: true»."""
    proc = subprocess.run(
        ["pmtiles", "show", str(path)],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        return False
    for line in proc.stdout.splitlines():
        if line.lower().startswith("clustered:"):
            return "true" in line.lower()
    return False


def cluster_pmtiles(src: Path, dst: Path) -> None:
    """Re-cluster pmtiles: read all tiles, sort by tile_id, write back.

    `pmtiles convert` (CLI) умеет только mbtiles → pmtiles, не
    pmtiles → pmtiles, поэтому делаем through-Python. pmtiles ≤200 МБ
    легко влезают в RAM (water 6 МБ, waterway 27 МБ, wetlands 20 МБ).
    Forest (302 МБ) уже clustered — этот path не запустится.
    """
    from pmtiles.reader import MmapSource, Reader, all_tiles  # type: ignore
    from pmtiles.writer import Writer  # type: ignore
    from pmtiles.tile import zxy_to_tileid  # type: ignore

    with open(src, "rb") as f_src:
        get_bytes = MmapSource(f_src)
        reader = Reader(get_bytes)
        header = reader.header()
        metadata = reader.metadata()
        # Соберём (tile_id, data) в RAM
        tiles: list[tuple[int, bytes]] = []
        for (z, x, y), data in all_tiles(get_bytes):
            tiles.append((zxy_to_tileid(z, x, y), data))
        tiles.sort(key=lambda t: t[0])

    dst.parent.mkdir(parents=True, exist_ok=True)
    with open(dst, "wb") as f_dst:
        writer = Writer(f_dst)
        for tile_id, data in tiles:
            writer.write_tile(tile_id, data)
        writer.finalize(header, metadata)


def ensure_clustered(src: Path, cache_dir: Path) -> Path:
    """Если source pmtiles НЕ clustered — переcборать в clustered
    через python-pmtiles (cluster_pmtiles). Кэшируется по имени, чтобы
    не повторять для каждого района."""
    if is_clustered(src):
        return src
    cache_dir.mkdir(parents=True, exist_ok=True)
    cached = cache_dir / src.name
    if cached.exists() and cached.stat().st_mtime >= src.stat().st_mtime:
        return cached
    print(f"  clustering {src.name} -> {cached}…", flush=True)
    cluster_pmtiles(src, cached)
    return cached


def extract_tile(
    src: Path,
    dst: Path,
    bbox: tuple[float, float, float, float],
    buffer_deg: float,
) -> None:
    s, w, n, e = bbox
    s -= buffer_deg
    n += buffer_deg
    w -= buffer_deg
    e += buffer_deg
    dst.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "pmtiles",
        "extract",
        str(src),
        str(dst),
        "--bbox",
        f"{w},{s},{e},{n}",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        # Не завершаем pipeline целиком — один битый layer-район
        # не должен ронять остальные 71 файл.
        print(
            f"  ! pmtiles extract failed: {proc.stderr.strip()[:200]}",
            flush=True,
        )
        if dst.exists():
            dst.unlink()


def build_manifest(
    out_dir: Path,
    districts: list[tuple[str, str, tuple[float, float, float, float]]],
    layers: list[str],
    base_url: str,
    manifest_version: str,
) -> dict:
    regions = []
    for slug, name_ru, bbox in districts:
        layer_entries = []
        total_bytes = 0
        for layer in layers:
            f = out_dir / slug / f"{layer}.pmtiles"
            if not f.exists():
                continue
            size = f.stat().st_size
            sha = sha256_of(f)
            total_bytes += size
            layer_entries.append({
                "name": layer,
                "url": f"{base_url}/districts/{slug}/{layer}.pmtiles",
                "size_bytes": size,
                "sha256": sha,
            })
        if not layer_entries:
            continue
        regions.append({
            "slug": slug,
            "name": name_ru,
            "bbox": list(bbox),  # [south, west, north, east]
            "layers": layer_entries,
            "total_size_bytes": total_bytes,
            "manifest_version": manifest_version,
        })
    return {
        "version": manifest_version,
        "generated_at": int(time.time()),
        "base_url": base_url,
        "regions": regions,
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--in-dir",
        type=Path,
        default=Path("data/tiles"),
        help="Source directory with full-LO pmtiles (default: data/tiles)",
    )
    p.add_argument(
        "--out-dir",
        type=Path,
        default=Path("data/tiles/districts"),
        help="Output directory for per-district packages (default: data/tiles/districts)",
    )
    p.add_argument(
        "--manifest",
        type=Path,
        default=Path("data/tiles/regions.json"),
        help="Path to write the manifest JSON (default: data/tiles/regions.json)",
    )
    p.add_argument("--district", help="single district slug — для итеративной отладки")
    p.add_argument(
        "--layers",
        default=",".join(DEFAULT_LAYERS),
        help=f"comma-separated layer names (default: {','.join(DEFAULT_LAYERS)})",
    )
    p.add_argument("--buffer-deg", type=float, default=0.05)
    p.add_argument(
        "--base-url",
        default=os.environ.get("TILES_BASE_URL", "https://api.geobiom.ru/tiles"),
        help="URL prefix to put into manifest (TILES_BASE_URL env)",
    )
    p.add_argument(
        "--manifest-version",
        default=time.strftime("%Y-%m-%d"),
        help="String written to manifest, used by mobile to detect updates",
    )
    p.add_argument(
        "--dsn",
        default=os.environ.get(
            "DATABASE_URL",
            "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map",
        ),
    )
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    if not shutil.which("pmtiles"):
        sys.exit("pmtiles CLI not on PATH")

    layers = [s.strip() for s in args.layers.split(",") if s.strip()]
    for layer in layers:
        src = args.in_dir / f"{layer}.pmtiles"
        if not src.exists():
            sys.exit(f"source layer not found: {src}")

    districts = get_districts(args.dsn)
    if args.district:
        districts = [d for d in districts if d[0] == args.district]
        if not districts:
            sys.exit(f"district slug {args.district!r} not found")

    print(
        f"districts: {len(districts)} | layers: {layers} | "
        f"out: {args.out_dir}",
        flush=True,
    )
    if args.dry_run:
        print("--dry-run: nothing written", flush=True)
        return

    args.out_dir.mkdir(parents=True, exist_ok=True)

    # Подготовка clustered-копий каждого исходного слоя (один раз на
    # запуск). Без этого `pmtiles extract` падает с
    # «source archive must be clustered».
    cluster_cache = args.in_dir / "_clustered"
    src_paths: dict[str, Path] = {}
    for layer in layers:
        src = args.in_dir / f"{layer}.pmtiles"
        src_paths[layer] = ensure_clustered(src, cluster_cache)

    for slug, name_ru, bbox in districts:
        print(f"--- {slug} ({name_ru}) ---", flush=True)
        for layer in layers:
            dst = args.out_dir / slug / f"{layer}.pmtiles"
            t0 = time.time()
            extract_tile(src_paths[layer], dst, bbox, args.buffer_deg)
            if dst.exists():
                size_mb = dst.stat().st_size / (1024 * 1024)
                print(
                    f"  {layer:10s} -> {dst.relative_to(args.out_dir.parent.parent)} "
                    f"({size_mb:6.1f} MB in {time.time() - t0:.1f}s)",
                    flush=True,
                )

    print(f"--- generating manifest at {args.manifest} ---", flush=True)
    manifest = build_manifest(
        args.out_dir,
        districts,
        layers,
        args.base_url,
        args.manifest_version,
    )
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    total_bytes = sum(r["total_size_bytes"] for r in manifest["regions"])
    print(
        f"OK: {len(manifest['regions'])} regions, "
        f"{total_bytes / (1024 * 1024):.0f} MB total",
        flush=True,
    )


if __name__ == "__main__":
    main()
