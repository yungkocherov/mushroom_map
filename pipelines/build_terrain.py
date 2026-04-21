"""
Merge Copernicus GLO-30 DEM tiles and compute slope/aspect/hillshade.

Steps:
  1. merge     — склеивает 81 тайл EPSG:4326 в mosaic_4326.tif
  2. reproject — перепроецирует в UTM 36N (EPSG:32636), 30 m/pixel → dem_utm.tif
  3. derive    — считает slope.tif + aspect.tif + hillshade.tif (Horn, EPSG:32636)

UTM 36N covers 30..36°E well; для bbox 28..37°E искажения < 0.2% на краях —
приемлемо для склонов hiking-scale. Endpoint /api/terrain/at сэмплит в UTM.

Выходы в data/copernicus/terrain/:
    mosaic_4326.tif   — debug/backup (~1.6 GB, Int16 + LZW)
    dem_utm.tif       — EPSG:32636, 30 m, Int16, LZW
    slope.tif         — градусы [0..90], Float32→Int8 после clamp
    aspect.tif        — градусы от севера [0..360), Float32→Int16
    hillshade.tif     — [0..255], Byte, LZW (для тайлов)

Usage:
    .venv/Scripts/python.exe -u pipelines/build_terrain.py --step all
    .venv/Scripts/python.exe -u pipelines/build_terrain.py --step merge
    .venv/Scripts/python.exe -u pipelines/build_terrain.py --step reproject
    .venv/Scripts/python.exe -u pipelines/build_terrain.py --step derive
"""

from __future__ import annotations

import argparse
import math
import time
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.merge import merge as rio_merge
from rasterio.vrt import WarpedVRT
from rasterio.warp import calculate_default_transform, reproject, transform_bounds
from rasterio.windows import Window

SRC_DIR  = Path("data/copernicus/dem_glo30")
OUT_DIR  = Path("data/copernicus/terrain")
MOSAIC   = OUT_DIR / "mosaic_4326.tif"
DEM_UTM  = OUT_DIR / "dem_utm.tif"
SLOPE    = OUT_DIR / "slope.tif"
ASPECT   = OUT_DIR / "aspect.tif"
HILLSH   = OUT_DIR / "hillshade.tif"

UTM_EPSG   = 32636  # UTM zone 36N
UTM_PIXEL  = 30.0   # meters
CHUNK_ROWS = 2048   # для derive — окно с 1 строкой overlap


def step_merge() -> None:
    """Объединяет 81 тайл в Int16 EPSG:4326 mosaic.

    rio_merge(dst_path=...) однажды уже выдал пустой файл (все нули) —
    streaming-режим не подружился с Float32 без nodata. Поэтому:
    1) конвертим Float32 -> Int16 через WarpedVRT (halve memory);
    2) merge сразу в память в Int16;
    3) пишем одним write().
    """
    tiles = sorted(SRC_DIR.glob("*.tif"))
    print(f"merge: {len(tiles)} source tiles -> {MOSAIC}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    NODATA = -32768
    srcs = []
    vrts = []
    for p in tiles:
        s = rasterio.open(p)
        srcs.append(s)
        vrts.append(WarpedVRT(s, dtype="int16", nodata=NODATA,
                              resampling=Resampling.nearest))
    try:
        mosaic, transform = rio_merge(vrts, nodata=NODATA,
                                       resampling=Resampling.nearest)
        print(f"  merged: {mosaic.shape}, dtype={mosaic.dtype}, "
              f"range={mosaic[mosaic != NODATA].min()}..{mosaic[mosaic != NODATA].max()}")
        meta = {
            "driver":    "GTiff",
            "height":    mosaic.shape[1],
            "width":     mosaic.shape[2],
            "count":     1,
            "dtype":     "int16",
            "crs":       srcs[0].crs,
            "transform": transform,
            "nodata":    NODATA,
            "compress":  "lzw",
            "predictor": 2,
            "tiled":     True,
            "blockxsize": 512,
            "blockysize": 512,
            "bigtiff":   "YES",
        }
        with rasterio.open(MOSAIC, "w", **meta) as dst:
            dst.write(mosaic)
        print(f"  -> {MOSAIC}")
    finally:
        for v in vrts: v.close()
        for s in srcs: s.close()


def step_reproject() -> None:
    print(f"reproject: {MOSAIC} -> EPSG:{UTM_EPSG} @ {UTM_PIXEL} m")
    with rasterio.open(MOSAIC) as src:
        transform, width, height = calculate_default_transform(
            src.crs, f"EPSG:{UTM_EPSG}", src.width, src.height, *src.bounds,
            resolution=UTM_PIXEL,
        )
        meta = src.meta.copy()
        meta.update({
            "crs":        f"EPSG:{UTM_EPSG}",
            "transform":  transform,
            "width":      width,
            "height":     height,
            "compress":   "lzw",
            "predictor":  2,
            "tiled":      True,
            "blockxsize": 512,
            "blockysize": 512,
            "bigtiff":    "YES",
        })
        print(f"  target: {width} x {height}")
        with rasterio.open(DEM_UTM, "w", **meta) as dst:
            for i in range(1, src.count + 1):
                reproject(
                    source=rasterio.band(src, i),
                    destination=rasterio.band(dst, i),
                    src_transform=src.transform,
                    src_crs=src.crs,
                    dst_transform=transform,
                    dst_crs=f"EPSG:{UTM_EPSG}",
                    resampling=Resampling.bilinear,
                    num_threads=4,
                )
        print(f"  -> {DEM_UTM}")


def horn_slope_aspect(dem: np.ndarray, cell: float) -> tuple[np.ndarray, np.ndarray]:
    """Horn (1981) 3x3 gradient. Returns (slope_deg, aspect_deg_from_north).

    dem: float32, no-data replaced by neighbour via numpy pad edge. Border
    row/col get slope=0, aspect=-1 (handled in caller by masking).
    """
    z = dem
    # z[i-1,j-1] z[i-1,j] z[i-1,j+1]
    # z[i  ,j-1] z[i  ,j] z[i  ,j+1]
    # z[i+1,j-1] z[i+1,j] z[i+1,j+1]
    a = z[:-2, :-2]; b = z[:-2, 1:-1]; c = z[:-2, 2:]
    d = z[1:-1,:-2]; f = z[1:-1, 2:]
    g = z[2:,  :-2]; h = z[2:,  1:-1]; i = z[2:,  2:]

    dzdx = ((c + 2*f + i) - (a + 2*d + g)) / (8.0 * cell)
    dzdy = ((g + 2*h + i) - (a + 2*b + c)) / (8.0 * cell)

    slope_rad = np.arctan(np.hypot(dzdx, dzdy))
    slope_deg = np.degrees(slope_rad)

    # aspect: 0° = N, clockwise. atan2 возвращает от -pi до pi.
    # Formula per ESRI: aspect = 180/pi * atan2(dz/dy, -dz/dx); convert to compass.
    aspect_rad = np.arctan2(dzdy, -dzdx)
    aspect_deg = np.degrees(aspect_rad)
    aspect_compass = np.where(aspect_deg < 0, 90.0 - aspect_deg,
                              np.where(aspect_deg > 90.0, 360.0 - aspect_deg + 90.0,
                                       90.0 - aspect_deg))
    # Плоские ячейки: aspect = -1 (sentinel)
    flat = (dzdx == 0) & (dzdy == 0)
    aspect_compass = np.where(flat, -1.0, aspect_compass)
    return slope_deg.astype(np.float32), aspect_compass.astype(np.float32)


def horn_hillshade(dem: np.ndarray, cell: float,
                   az_deg: float = 315.0, alt_deg: float = 45.0,
                   z_factor: float = 1.0) -> np.ndarray:
    """Standard hillshade 0..255 (Byte)."""
    z = dem
    a = z[:-2, :-2]; b = z[:-2, 1:-1]; c = z[:-2, 2:]
    d = z[1:-1,:-2]; f = z[1:-1, 2:]
    g = z[2:,  :-2]; h = z[2:,  1:-1]; i = z[2:,  2:]

    dzdx = ((c + 2*f + i) - (a + 2*d + g)) / (8.0 * cell) * z_factor
    dzdy = ((g + 2*h + i) - (a + 2*b + c)) / (8.0 * cell) * z_factor

    slope = np.arctan(np.hypot(dzdx, dzdy))
    aspect = np.arctan2(dzdy, -dzdx)

    az  = math.radians(360.0 - az_deg + 90.0)
    alt = math.radians(alt_deg)

    hs = (np.cos(alt) * np.cos(slope)
          + np.sin(alt) * np.sin(slope) * np.cos(az - aspect))
    hs = np.clip(hs * 255.0, 0, 255).astype(np.uint8)
    return hs


def step_derive() -> None:
    """Потоково считает slope/aspect/hillshade из dem_utm.tif."""
    print(f"derive: {DEM_UTM}")
    with rasterio.open(DEM_UTM) as src:
        profile = src.profile
        cell = abs(src.transform.a)
        print(f"  cell size = {cell} m")

        # Общий профиль для выходов.
        def make_profile(dtype: str, nodata) -> dict:
            p = profile.copy()
            p.update({
                "dtype":     dtype,
                "count":     1,
                "compress":  "lzw",
                "predictor": 2 if dtype != "uint8" else 1,
                "tiled":     True,
                "blockxsize": 512,
                "blockysize": 512,
                "nodata":    nodata,
                "bigtiff":   "YES",
            })
            return p

        # slope  — int16, scale x10 (шаг 0.1°, макс ~900 = 90°). nodata = -1.
        # aspect — int16, градусы 0..359 (шаг 1°). nodata = -1 (sentinel для плоских).
        slope_dst  = rasterio.open(SLOPE,  "w", **make_profile("int16", -1))
        aspect_dst = rasterio.open(ASPECT, "w", **make_profile("int16", -1))
        hill_dst   = rasterio.open(HILLSH, "w", **make_profile("uint8",  0))
        t0 = time.monotonic()
        try:
            H, W = src.height, src.width
            row = 0
            while row < H:
                r0 = max(row - 1, 0)
                r1 = min(row + CHUNK_ROWS + 1, H)
                win = Window(0, r0, W, r1 - r0)
                dem = src.read(1, window=win).astype(np.float32)
                # Copernicus GLO-30 nodata is usually -32767 but often clean.
                if src.nodata is not None:
                    dem[dem == src.nodata] = np.nan
                # Заполняем NaN перед градиентом — простой forward fill.
                if np.isnan(dem).any():
                    dem = np.where(np.isnan(dem), 0.0, dem)

                slope_f, aspect_f = horn_slope_aspect(dem, cell)
                hs = horn_hillshade(dem, cell)

                # Int16-упаковка. slope x10 для 0.1° точности; aspect округление.
                slope_i = np.clip(slope_f * 10.0, 0, 32767).astype(np.int16)
                aspect_i = np.where(aspect_f < 0, -1,
                                    np.round(aspect_f).astype(np.int16))

                # Horn возвращает массив на 2 меньше в каждой стороне.
                # Первая строка выхода = исходная строка r0+1; первая колонка = 1.
                write_win = Window(1, r0 + 1, W - 2, slope_i.shape[0])
                slope_dst.write(slope_i,  1, window=write_win)
                aspect_dst.write(aspect_i, 1, window=write_win)
                hill_dst.write(hs,        1, window=write_win)

                print(f"  rows {row:6d}..{r1:6d}/{H}  ({time.monotonic()-t0:.0f}s)")
                row += CHUNK_ROWS
        finally:
            slope_dst.close()
            aspect_dst.close()
            hill_dst.close()
        print(f"  -> {SLOPE}\n  -> {ASPECT}\n  -> {HILLSH}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--step", choices=["all", "merge", "reproject", "derive"],
                    default="all")
    args = ap.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if args.step in ("all", "merge"):
        step_merge()
    if args.step in ("all", "reproject"):
        step_reproject()
    if args.step in ("all", "derive"):
        step_derive()


if __name__ == "__main__":
    main()
