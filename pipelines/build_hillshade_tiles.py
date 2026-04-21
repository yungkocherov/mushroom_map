"""
Build hillshade.pmtiles — цветной рельеф (гипсометрия + hillshade) для ЛО+Карелии.

Стратегия:
  1. Два WarpedVRT: dem_utm.tif + hillshade.tif → EPSG:3857 виртуально.
  2. Для каждого (z,x,y): читаем окно 256×256 из обоих VRT.
  3. Hypsometric ramp по высоте → базовый RGB.
  4. Множим на hillshade / 128 (clamped) — даёт 3D-объём.
  5. Alpha = 0 где dem = nodata (убирает «тени» на углах 3857-реекции),
     иначе фиксированное BASE_ALPHA (видна подложка сквозь цвет).

bbox ЛО+Карелия: lat 58..67, lon 28..37. Зумы 6..11.

Usage:
    .venv/Scripts/python.exe -u pipelines/build_hillshade_tiles.py
"""

from __future__ import annotations

import argparse
import io
import math
import time
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer
from rasterio.enums import Resampling
from rasterio.vrt import WarpedVRT
from rasterio.windows import Window, from_bounds

DEM_SRC = Path("data/copernicus/terrain/dem_utm.tif")
HS_SRC  = Path("data/copernicus/terrain/hillshade.tif")
OUT     = Path("data/tiles/hillshade.pmtiles")

BBOX = (28.0, 58.0, 37.0, 67.0)
MIN_ZOOM = 6
MAX_ZOOM = 11

WEB_MERC_EXTENT = 20037508.342789244

# Hypsometric ramp для ЛО+Карелии (0..600 м). Точки — (elevation_m, R, G, B).
# 0–100 м: болота/равнины → пастельно-зелёный.
# 100–250 м: холмы Ингерманландии/южной Карелии → охра.
# 250+ м: карельская возвышенность → коричневый.
RAMP = np.array([
    (  0, 109, 181, 106),   # #6db56a  насыщенный зелёный (низины)
    ( 50, 184, 208,  96),   # #b8d060  лаймовый
    (100, 232, 200,  80),   # #e8c850  золото/охра
    (200, 216, 138,  64),   # #d88a40  оранжево-коричневый
    (350, 160,  80,  40),   # #a05028  ржавый
    (600,  90,  48,  32),   # #5a3020  тёмно-коричневый
], dtype=np.float32)

# Прозрачность полезного пикселя. Карта — overlay поверх satellite/схемы,
# поэтому не 255; нужно пропускать лес/озёра подложки.
BASE_ALPHA = 210

# Интенсивность теневого модулирования (0..1). 0.5 = тени 50%, света 150%.
HS_STRENGTH = 0.45


def lonlat_to_tile(lat: float, lon: float, z: int) -> tuple[int, int]:
    n = 2 ** z
    x = int((lon + 180.0) / 360.0 * n)
    lat_r = math.radians(lat)
    y = int((1.0 - math.log(math.tan(lat_r) + 1.0 / math.cos(lat_r)) / math.pi)
            / 2.0 * n)
    return x, y


def tile_bounds_3857(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    n = 2 ** z
    tile_size = WEB_MERC_EXTENT * 2 / n
    minx = -WEB_MERC_EXTENT + x * tile_size
    maxx = minx + tile_size
    maxy = WEB_MERC_EXTENT - y * tile_size
    miny = maxy - tile_size
    return minx, miny, maxx, maxy


def elevation_to_rgb(dem: np.ndarray) -> np.ndarray:
    """Линейная интерполяция по RAMP. Возвращает uint8 RGB того же shape + (3,)."""
    h = dem.astype(np.float32)
    h = np.clip(h, RAMP[0, 0], RAMP[-1, 0])
    rgb = np.empty((*dem.shape, 3), dtype=np.float32)
    for i in range(3):
        rgb[..., i] = np.interp(h, RAMP[:, 0], RAMP[:, i + 1])
    return rgb  # float32 0..255


def clip_window(vrt: WarpedVRT, z: int, x: int, y: int):
    """Возвращает (clipped_window, tile_x0, tile_y0, tile_w, tile_h) или None."""
    minx, miny, maxx, maxy = tile_bounds_3857(z, x, y)
    try:
        win = from_bounds(minx, miny, maxx, maxy, transform=vrt.transform)
    except Exception:
        return None
    vrt_h, vrt_w = vrt.height, vrt.width
    col_off = int(win.col_off)
    row_off = int(win.row_off)
    width   = int(win.width)
    height  = int(win.height)
    if col_off + width <= 0 or row_off + height <= 0 \
            or col_off >= vrt_w or row_off >= vrt_h:
        return None
    col_start = max(col_off, 0)
    row_start = max(row_off, 0)
    col_end   = min(col_off + width,  vrt_w)
    row_end   = min(row_off + height, vrt_h)
    clipped = Window(col_start, row_start,
                     col_end - col_start, row_end - row_start)
    tile_x0 = int(round((col_start - col_off) * 256 / max(width, 1)))
    tile_y0 = int(round((row_start - row_off) * 256 / max(height, 1)))
    tile_x1 = int(round((col_end   - col_off) * 256 / max(width, 1)))
    tile_y1 = int(round((row_end   - row_off) * 256 / max(height, 1)))
    tile_w = max(tile_x1 - tile_x0, 1)
    tile_h = max(tile_y1 - tile_y0, 1)
    return clipped, tile_x0, tile_y0, tile_w, tile_h


def build_tile(dem_vrt: WarpedVRT, hs_vrt: WarpedVRT,
               z: int, x: int, y: int) -> bytes | None:
    clip = clip_window(dem_vrt, z, x, y)
    if clip is None:
        return None
    clipped, tile_x0, tile_y0, tile_w, tile_h = clip
    dem = dem_vrt.read(1, window=clipped, out_shape=(tile_h, tile_w),
                       resampling=Resampling.bilinear)
    # Маска покрытия: DEM nodata = -32768. Вне покрытия пиксель не пишем.
    valid = dem > -1000
    if not valid.any():
        return None

    hs_clip = clip_window(hs_vrt, z, x, y)
    if hs_clip is not None:
        hc, hx, hy, hw, hh = hs_clip
        hs = hs_vrt.read(1, window=hc, out_shape=(hh, hw),
                         resampling=Resampling.bilinear)
        # выравниваем размер hs под (tile_h, tile_w) — WarpedVRT bounds у растров
        # идентичны (один UTM), но численно window_clip может дать ±1px.
        if hs.shape != dem.shape:
            pad_h = dem.shape[0] - hs.shape[0]
            pad_w = dem.shape[1] - hs.shape[1]
            if pad_h > 0 or pad_w > 0:
                hs = np.pad(hs, ((0, max(pad_h, 0)), (0, max(pad_w, 0))),
                            mode="edge")
            hs = hs[:dem.shape[0], :dem.shape[1]]
    else:
        hs = np.full_like(dem, 128, dtype=np.uint8)

    rgb = elevation_to_rgb(np.where(valid, dem, 0))
    # Hillshade модулятор: (hs/128 - 1) — центрирован на 1.0.
    shade = 1.0 + (hs.astype(np.float32) / 128.0 - 1.0) * HS_STRENGTH
    shade = np.clip(shade, 0.5, 1.5)
    rgb = np.clip(rgb * shade[..., None], 0, 255).astype(np.uint8)

    alpha_inner = np.where(valid, BASE_ALPHA, 0).astype(np.uint8)

    out = np.zeros((256, 256, 4), dtype=np.uint8)
    out[tile_y0:tile_y0+tile_h, tile_x0:tile_x0+tile_w, :3] = rgb
    out[tile_y0:tile_y0+tile_h, tile_x0:tile_x0+tile_w,  3] = alpha_inner

    img = Image.fromarray(out, mode="RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--minzoom", type=int, default=MIN_ZOOM)
    ap.add_argument("--maxzoom", type=int, default=MAX_ZOOM)
    ap.add_argument("--out",     default=str(OUT))
    args = ap.parse_args()

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = out_path.with_suffix(".pmtiles.tmp")

    print(f"dem: {DEM_SRC}  hs: {HS_SRC}  out: {out_path}  "
          f"zoom: {args.minzoom}..{args.maxzoom}")
    t0 = time.monotonic()
    written = 0

    with rasterio.open(DEM_SRC) as dem_src, rasterio.open(HS_SRC) as hs_src:
        with WarpedVRT(dem_src, crs="EPSG:3857",
                       resampling=Resampling.bilinear,
                       src_nodata=dem_src.nodata,
                       nodata=dem_src.nodata) as dem_vrt, \
             WarpedVRT(hs_src, crs="EPSG:3857",
                       resampling=Resampling.bilinear) as hs_vrt:
            with open(tmp_path, "wb") as f:
                writer = Writer(f)
                for z in range(args.minzoom, args.maxzoom + 1):
                    min_lon, min_lat, max_lon, max_lat = BBOX
                    x0, y0 = lonlat_to_tile(max_lat, min_lon, z)
                    x1, y1 = lonlat_to_tile(min_lat, max_lon, z)
                    x_min, x_max = min(x0, x1), max(x0, x1)
                    y_min, y_max = min(y0, y1), max(y0, y1)
                    n_total = (x_max - x_min + 1) * (y_max - y_min + 1)
                    z_ok = 0
                    tz = time.monotonic()
                    for tx in range(x_min, x_max + 1):
                        for ty in range(y_min, y_max + 1):
                            png = build_tile(dem_vrt, hs_vrt, z, tx, ty)
                            if png is None:
                                continue
                            writer.write_tile(zxy_to_tileid(z, tx, ty), png)
                            z_ok    += 1
                            written += 1
                    print(f"  z={z:<2d} tiles={n_total:<6d} ok={z_ok:<6d} "
                          f"({time.monotonic()-tz:.1f}s)")

                header = {
                    "version":        3,
                    "tile_type":      TileType.PNG,
                    "tile_compression": Compression.NONE,
                    "min_zoom":       args.minzoom,
                    "max_zoom":       args.maxzoom,
                    "min_lon_e7":     int(BBOX[0] * 1e7),
                    "min_lat_e7":     int(BBOX[1] * 1e7),
                    "max_lon_e7":     int(BBOX[2] * 1e7),
                    "max_lat_e7":     int(BBOX[3] * 1e7),
                    "center_zoom":    (args.minzoom + args.maxzoom) // 2,
                    "center_lon_e7":  int((BBOX[0] + BBOX[2]) / 2 * 1e7),
                    "center_lat_e7":  int((BBOX[1] + BBOX[3]) / 2 * 1e7),
                }
                metadata = {
                    "name":        "mushroom-map terrain lenoblast+karelia",
                    "description": "Hypsometric tint + hillshade from Copernicus GLO-30 DEM",
                    "attribution": "Copernicus GLO-30 DEM",
                }
                writer.finalize(header, metadata)

    tmp_path.replace(out_path)
    elapsed = time.monotonic() - t0
    size_mb = out_path.stat().st_size / 1024 / 1024
    print(f"\ndone: {written} tiles, {size_mb:.1f} MB, {elapsed:.1f}s")


if __name__ == "__main__":
    main()
