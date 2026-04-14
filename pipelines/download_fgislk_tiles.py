"""
download_fgislk_tiles: качает MVT-тайлы слоя FOREST_LAYERS:FOREST из ФГИС ЛК
через публичный GeoWebCache.

Источник:
    https://pub5.fgislk.gov.ru/plk/gwc-01/geowebcache/service/tms/1.0.0/
      FOREST_LAYERS:FOREST@EPSG:3857@pbf/{z}/{x}/{y}.pbf

Сетка **кастомная** (не стандартный Google XYZ), описание получено из
TileMap descriptor:
    SRS:       EPSG:3857
    Origin:    (-20037508.34, -20073348.34)
    Tile size: 256x256
    Zoom:      7..12, units-per-pixel = 140, 56, 28, 14, 7, 2.8

Внутри одного MVT-тайла **17 source-layer'ов**, самый ценный:
    TAXATION_PIECE_PVS — лесотаксационные выделы с атрибутами:
        externalid      — "47:10:6:55:15" (субъект:лесничество:участок:квартал:выдел)
        id              — уникальный числовой id
        label_name      — номер выдела
        tree_species    — доминирующая порода («Ель», «Сосна», ...)
        age_group       — группа возраста («спелые», «молодняки», ...)

Использование:
    # PoC на маленьком bbox (~2000 тайлов, 5-15 минут)
    python pipelines/download_fgislk_tiles.py \\
        --bbox 30.00,60.20,30.30,60.35 \\
        --out data/rosleshoz/fgislk_tiles

    # Вся Ленобласть (~830k тайлов, часы)
    python pipelines/download_fgislk_tiles.py \\
        --bbox 27.8,58.5,33.0,61.8 \\
        --concurrency 16 \\
        --out data/rosleshoz/fgislk_tiles

    # Только подсчитать план
    python pipelines/download_fgislk_tiles.py --bbox 27.8,58.5,33.0,61.8 --plan-only
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import httpx
from pyproj import Transformer


# ─── GWC grid parameters (из TileMap descriptor) ─────────────────────────────
ORIGIN_X = -20037508.34
ORIGIN_Y = -20037508.34
TILE_SIZE = 256

#: units-per-pixel на каждом zoom level (из TileMap XML)
UPP: dict[int, float] = {7: 140.0, 8: 56.0, 9: 28.0, 10: 14.0, 11: 7.0, 12: 2.8}

DEFAULT_LAYER = "FOREST_LAYERS:FOREST@EPSG:3857@pbf"
BASE_URL = "https://pub5.fgislk.gov.ru/plk/gwc-01/geowebcache/service/tms/1.0.0"

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": "https://pub.fgislk.gov.ru/map/",
    "Accept": "application/vnd.mapbox-vector-tile,*/*;q=0.8",
    "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
}

# Для конвертации lat/lon ↔ meters
_TR_LATLON_TO_METERS = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)


@dataclass(frozen=True)
class Bbox:
    west: float
    south: float
    east: float
    north: float

    @classmethod
    def parse(cls, s: str) -> "Bbox":
        parts = [float(x) for x in s.split(",")]
        if len(parts) != 4:
            raise ValueError(f"bbox должен быть 'west,south,east,north': {s!r}")
        return cls(*parts)


def latlon_to_tile(lat: float, lon: float, zoom: int) -> tuple[float, float]:
    mx, my = _TR_LATLON_TO_METERS.transform(lon, lat)
    upt = UPP[zoom] * TILE_SIZE
    return (mx - ORIGIN_X) / upt, (my - ORIGIN_Y) / upt


def bbox_to_tile_range(bbox: Bbox, zoom: int) -> tuple[int, int, int, int]:
    """Возвращает (x0, y0, x1, y1) включительно-эксклюзивный диапазон."""
    tx0, ty0 = latlon_to_tile(bbox.south, bbox.west, zoom)
    tx1, ty1 = latlon_to_tile(bbox.north, bbox.east, zoom)
    x0 = int(min(tx0, tx1))
    x1 = int(max(tx0, tx1)) + 1
    y0 = int(min(ty0, ty1))
    y1 = int(max(ty0, ty1)) + 1
    return x0, y0, x1, y1


def tile_url(layer: str, zoom: int, x: int, y: int) -> str:
    return f"{BASE_URL}/{layer}/{zoom}/{x}/{y}.pbf"


# ─── Downloader ───────────────────────────────────────────────────────────────

@dataclass
class DlStats:
    ok: int = 0
    empty: int = 0
    skipped: int = 0
    errors: int = 0
    bytes: int = 0


async def _fetch_one(
    client: httpx.AsyncClient,
    zoom: int,
    x: int,
    y: int,
    layer: str,
    out_root: Path,
    sem: asyncio.Semaphore,
    stats: DlStats,
    progress: dict,
    retries: int = 3,
) -> None:
    out_path = out_root / str(zoom) / str(x) / f"{y}.pbf"
    if out_path.exists():
        stats.skipped += 1
        _bump_progress(progress)
        return

    url = tile_url(layer, zoom, x, y)
    async with sem:
        for attempt in range(retries):
            try:
                r = await client.get(url)
                if r.status_code == 200:
                    content = r.content
                    if len(content) > 0:
                        out_path.parent.mkdir(parents=True, exist_ok=True)
                        out_path.write_bytes(content)
                        stats.ok += 1
                        stats.bytes += len(content)
                    else:
                        stats.empty += 1
                    _bump_progress(progress)
                    return
                if r.status_code == 404:
                    stats.empty += 1
                    _bump_progress(progress)
                    return
                # 5xx / rate limit — бэкофф и повтор
                if r.status_code in (429, 500, 502, 503, 504):
                    wait = 1.0 * (attempt + 1) ** 2
                    await asyncio.sleep(wait)
                    continue
                stats.errors += 1
                _bump_progress(progress)
                return
            except (httpx.TimeoutException, httpx.NetworkError, httpx.RemoteProtocolError):
                wait = 1.0 * (attempt + 1)
                await asyncio.sleep(wait)
                continue
        stats.errors += 1
        _bump_progress(progress)


def _bump_progress(progress: dict) -> None:
    progress["done"] += 1
    now = time.monotonic()
    if now - progress["last_print"] >= 1.0:
        done = progress["done"]
        total = progress["total"]
        pct = 100.0 * done / total if total else 0.0
        elapsed = now - progress["start"]
        rate = done / elapsed if elapsed > 0 else 0.0
        eta = (total - done) / rate if rate > 0 else 0.0
        print(
            f"\r  {done}/{total} ({pct:.1f}%)  "
            f"{rate:.1f} req/s  ETA {eta/60:.1f} min",
            end="", flush=True,
        )
        progress["last_print"] = now


async def _download_range(
    zoom: int,
    x0: int, y0: int, x1: int, y1: int,
    layer: str,
    out_root: Path,
    concurrency: int,
    timeout_s: float,
) -> DlStats:
    limits = httpx.Limits(
        max_connections=concurrency * 2,
        max_keepalive_connections=concurrency,
    )
    async with httpx.AsyncClient(
        headers=DEFAULT_HEADERS,
        verify=False,
        timeout=timeout_s,
        http2=False,
        limits=limits,
    ) as client:
        sem = asyncio.Semaphore(concurrency)
        stats = DlStats()
        total = (x1 - x0) * (y1 - y0)
        progress = {"done": 0, "total": total, "start": time.monotonic(), "last_print": 0.0}

        tasks = [
            _fetch_one(client, zoom, x, y, layer, out_root, sem, stats, progress)
            for x in range(x0, x1)
            for y in range(y0, y1)
        ]
        await asyncio.gather(*tasks)
        return stats


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", default="27.8,58.5,33.0,61.8",
                    help="west,south,east,north (default = full Ленобласть)")
    ap.add_argument("--zoom", type=int, default=12,
                    help="zoom level (только 12 реально seeded на этом grid)")
    ap.add_argument("--layer", default=DEFAULT_LAYER,
                    help=f"GWC layer, default={DEFAULT_LAYER}")
    ap.add_argument("--out", default="data/rosleshoz/fgislk_tiles",
                    help="Корень кэша тайлов")
    ap.add_argument("--concurrency", type=int, default=8,
                    help="Параллельные запросы (default 8)")
    ap.add_argument("--timeout", type=float, default=30.0)
    ap.add_argument("--plan-only", action="store_true",
                    help="Только посчитать и показать tile range, не качать")
    args = ap.parse_args()

    bbox = Bbox.parse(args.bbox)
    zoom = args.zoom
    if zoom not in UPP:
        raise SystemExit(f"zoom {zoom} не в {sorted(UPP.keys())}")

    x0, y0, x1, y1 = bbox_to_tile_range(bbox, zoom)
    total = (x1 - x0) * (y1 - y0)
    w_tiles, h_tiles = x1 - x0, y1 - y0

    print(f"bbox:   {bbox.west},{bbox.south},{bbox.east},{bbox.north}")
    print(f"zoom:   {zoom}  (upp={UPP[zoom]} m/px)")
    print(f"range:  x={x0}..{x1} ({w_tiles})  y={y0}..{y1} ({h_tiles})")
    print(f"total:  {total} tiles")
    print(f"out:    {args.out}")

    if args.plan_only:
        return

    out_root = Path(args.out)
    out_root.mkdir(parents=True, exist_ok=True)

    print(f"\nqaчаем concurrency={args.concurrency}...")
    t0 = time.monotonic()
    stats = asyncio.run(_download_range(
        zoom, x0, y0, x1, y1,
        layer=args.layer,
        out_root=out_root,
        concurrency=args.concurrency,
        timeout_s=args.timeout,
    ))
    elapsed = time.monotonic() - t0

    print(f"\n\nFINISHED in {elapsed/60:.1f} min")
    print(f"  ok:      {stats.ok} tiles ({stats.bytes / 1024 / 1024:.1f} MB)")
    print(f"  empty:   {stats.empty}")
    print(f"  skipped: {stats.skipped}")
    print(f"  errors:  {stats.errors}")
    print(f"\nЗапусти конвертер: python pipelines/fgislk_tiles_to_geojson.py "
          f"--in {args.out} --out data/rosleshoz/fgislk_vydels.geojson")


if __name__ == "__main__":
    main()
