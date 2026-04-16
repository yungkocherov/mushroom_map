"""
tile_utils: общие утилиты для всех build_*_tiles.py скриптов.

Содержит функции, которые иначе дублировались бы в каждом из 7 пайплайнов:
  - build_dsn()       — строит строку подключения из env / дефолтов
  - lonlat_to_tile()  — WGS84 → XYZ-номер тайла
  - region_bbox()     — получает bbox региона из таблицы `region`
"""

from __future__ import annotations

import math
import os

import psycopg


def build_dsn() -> str:
    """Строит DSN из DATABASE_URL или отдельных POSTGRES_* переменных.

    Порядок приоритетов:
      1. DATABASE_URL
      2. POSTGRES_USER + POSTGRES_PASSWORD + POSTGRES_HOST + POSTGRES_PORT + POSTGRES_DB
      3. Дефолты для локальной разработки (порт 5434, user/pw = mushroom/mushroom_dev)
    """
    if url := os.environ.get("DATABASE_URL"):
        return url
    user = os.environ.get("POSTGRES_USER", "mushroom")
    pw   = os.environ.get("POSTGRES_PASSWORD", "mushroom_dev")
    host = os.environ.get("POSTGRES_HOST", "127.0.0.1")
    port = os.environ.get("POSTGRES_PORT", "5434")
    db   = os.environ.get("POSTGRES_DB", "mushroom_map")
    return f"postgresql://{user}:{pw}@{host}:{port}/{db}"


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
