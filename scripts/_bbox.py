"""Shared bbox constants and env-override helpers for download_*.py scripts.

LO_BBOX_DEFAULT покрывает Ленинградскую область целиком (с запасом по краям).
Скрипты могут запрашивать расширенный bbox через env-переменную, например
WATERWAY_BBOX / WETLAND_BBOX (для захвата соседних субъектов под training-data
ML-модели прогноза).
"""

from __future__ import annotations

import os

Bbox = tuple[float, float, float, float]  # (south, west, north, east)

LO_BBOX_DEFAULT: Bbox = (58.5, 27.8, 61.8, 33.0)


def load_bbox(env_var: str | None = None, default: Bbox = LO_BBOX_DEFAULT) -> Bbox:
    """Return bbox from env_var if set+valid, otherwise default.

    Env value format: 'south,west,north,east' (4 floats, comma-separated).
    Invalid env values are silently ignored — caller gets default.
    """
    if not env_var:
        return default
    raw = os.environ.get(env_var)
    if not raw:
        return default
    try:
        parts = [float(x) for x in raw.split(",")]
    except ValueError:
        return default
    if len(parts) != 4:
        return default
    return (parts[0], parts[1], parts[2], parts[3])


def load_split(env_var: str, default: int) -> int:
    raw = os.environ.get(env_var)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default
