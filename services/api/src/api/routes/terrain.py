"""
Terrain endpoint: высота / склон / экспозиция в точке.

    GET /api/terrain/at?lat=&lon=

Использование:
  1. UI: попап леса («высота 142 м, склон 4°, экспозиция ЮВ»).
  2. Feature-extractor для prediction-модели: склон и экспозиция —
     сильные предикторы влажности/инсоляции → плодоношения.

Источник: Copernicus GLO-30 DEM, склеен и перепроецирован в UTM 36N.
Предрасчитанные растры в data/copernicus/terrain/ :
  dem_utm.tif   — высота (Int16, метры)
  slope.tif     — Horn slope (Int16, шаг 0.1°, т.е. значение x10)
  aspect.tif    — Horn aspect (Int16, градусы от севера 0..359; -1 = плоско)

Если растры не собраны — возвращаем 503 (фича не готова).
"""

from __future__ import annotations

from pathlib import Path
from threading import Lock

import rasterio
from fastapi import APIRouter, HTTPException, Query
from pyproj import Transformer

from api.settings import settings

router = APIRouter()

# Растры монтируются в контейнер в settings.terrain_dir (default: /terrain).
# Локально (не-Docker) можно переопределить TERRAIN_DIR в окружении.
_TERRAIN = Path(settings.terrain_dir)
_DEM    = _TERRAIN / "dem_utm.tif"
_SLOPE  = _TERRAIN / "slope.tif"
_ASPECT = _TERRAIN / "aspect.tif"

_UTM_EPSG = 32636

_state: dict = {"ds": None, "transformer": None}
_lock = Lock()


def _open() -> dict | None:
    """Лениво открывает три растра + transformer. None если файлов нет."""
    if _state["ds"] is not None:
        return _state
    with _lock:
        if _state["ds"] is not None:
            return _state
        if not (_DEM.exists() and _SLOPE.exists() and _ASPECT.exists()):
            return None
        _state["ds"] = {
            "dem":    rasterio.open(_DEM),
            "slope":  rasterio.open(_SLOPE),
            "aspect": rasterio.open(_ASPECT),
        }
        _state["transformer"] = Transformer.from_crs(
            "EPSG:4326", f"EPSG:{_UTM_EPSG}", always_xy=True,
        )
        return _state


def _aspect_cardinal(deg: float) -> str | None:
    if deg is None or deg < 0:
        return None
    # 8-wind compass.
    dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    idx = int((deg + 22.5) // 45) % 8
    return dirs[idx]


@router.get("/at")
def terrain_at(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
) -> dict:
    state = _open()
    if state is None:
        raise HTTPException(status_code=503,
                            detail="terrain rasters not built yet")
    ds = state["ds"]
    x, y = state["transformer"].transform(lon, lat)

    def sample_one(src) -> float | None:
        try:
            val = next(src.sample([(x, y)], indexes=1))[0]
        except Exception:
            return None
        if src.nodata is not None and val == src.nodata:
            return None
        return float(val)

    elevation = sample_one(ds["dem"])
    slope_raw = sample_one(ds["slope"])   # x10 шкала
    aspect_raw = sample_one(ds["aspect"]) # градусы или -1

    if elevation is None:
        # Точка вне покрытия UTM-мозаики.
        return {"lat": lat, "lon": lon, "elevation_m": None,
                "slope_deg": None, "aspect_deg": None, "aspect_cardinal": None}

    slope_deg  = slope_raw / 10.0 if slope_raw is not None else None
    aspect_deg = aspect_raw if (aspect_raw is not None and aspect_raw >= 0) else None

    return {
        "lat":             lat,
        "lon":             lon,
        "elevation_m":     elevation,
        "slope_deg":       slope_deg,
        "aspect_deg":      aspect_deg,
        "aspect_cardinal": _aspect_cardinal(aspect_deg),
    }
