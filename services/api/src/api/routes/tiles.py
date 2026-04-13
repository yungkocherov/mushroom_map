"""
Vector tiles endpoint.

В phase 2 будет два режима:
  1. Статический PMTiles файл (data/tiles/forest.pmtiles) — раздаём напрямую
     через pmtiles server или как обычный static.
  2. Dynamic MVT из PostGIS через ST_AsMVT — если нужен live update.

Пока — заглушка с описанием контракта.
"""

from fastapi import APIRouter, Response

router = APIRouter()


@router.get("/forest/{z}/{x}/{y}.mvt")
def get_forest_tile(z: int, x: int, y: int) -> Response:
    """TODO: ST_AsMVT(forest_unified, 'forest', ...) или PMTiles range read."""
    return Response(status_code=501, content="TODO: phase 2")
