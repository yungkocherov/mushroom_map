"""
tile_utils: общие утилиты для всех build_*_tiles.py скриптов.

Содержит функции, которые иначе дублировались бы в каждом из 7 пайплайнов:
  - build_dsn()       — re-export из db_utils, оставлен для совместимости
  - lonlat_to_tile()  — WGS84 → XYZ-номер тайла
  - region_bbox()     — получает bbox региона из таблицы `region`
"""

from __future__ import annotations

import math

import psycopg

from db_utils import build_dsn  # re-export

__all__ = ["build_dsn", "lonlat_to_tile", "region_bbox"]


def lonlat_to_tile(lat: float, lon: float, z: int) -> tuple[int, int]:
    """Переводит WGS84-координаты в номер тайла (x, y) для заданного zoom.

    Формула — стандартный Web Mercator (Google/XYZ), y растёт вниз.
    """
    n = 2 ** z
    x = int((lon + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat)
    y = int((1 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2 * n)
    return x, y


def region_bbox(
    conn: psycopg.Connection,
    code: str,
) -> tuple[float, float, float, float]:
    """Возвращает (min_lon, min_lat, max_lon, max_lat) для региона по коду.

    Читает из таблицы `region` (bbox = geography/geometry колонка).
    Бросает SystemExit если регион не найден.
    """
    row = conn.execute(
        """
        SELECT ST_XMin(bbox), ST_YMin(bbox), ST_XMax(bbox), ST_YMax(bbox)
        FROM region WHERE code = %s
        """,
        (code,),
    ).fetchone()
    if row is None:
        raise SystemExit(f"регион {code!r} не найден в таблице region")
    return tuple(float(v) for v in row)  # type: ignore[return-value]
