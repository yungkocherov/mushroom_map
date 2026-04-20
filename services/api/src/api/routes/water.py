"""
Water-distance endpoint: расстояние от точки до ближайшего водотока/водоёма.

    GET /api/water/distance/at?lat=&lon=

Используется как:
  1. UI: поле в попапе леса («350 м до ручья», «1.2 км до озера»).
  2. Feature-extractor для prediction-модели (расстояние до воды как
     proxy для влажности — сильный предиктор плодоношения).

Ищет минимум среди:
  - osm_waterway (LineString: ручьи, реки, каналы) — KNN-индекс
  - water_zone   (MultiPolygon: озёра, моря, реки-полигоны) — KNN-индекс
  - wetland      (MultiPolygon: болота)
"""

from fastapi import APIRouter, Query

from api.db import get_conn

router = APIRouter()


@router.get("/distance/at")
def water_distance_at(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
) -> dict:
    """Минимальное расстояние до воды по трём источникам, метры."""
    with get_conn() as conn:
        # Геометрия точки в geography для метров.
        point_sql = "ST_SetSRID(ST_Point(%s, %s), 4326)::geography"

        # KNN-поиск через GIST. ORDER BY <geom> <-> point + LIMIT 1 — самый быстрый.
        ww = conn.execute(
            f"""
            SELECT id, waterway, name,
                   ST_Distance(geometry::geography, {point_sql}) AS dist_m
            FROM osm_waterway
            ORDER BY geometry <-> ST_SetSRID(ST_Point(%s, %s), 4326)
            LIMIT 1
            """,
            (lon, lat, lon, lat),
        ).fetchone()

        wz = conn.execute(
            f"""
            SELECT id, zone_type, layer_name,
                   ST_Distance(geometry::geography, {point_sql}) AS dist_m
            FROM water_zone
            ORDER BY geometry <-> ST_SetSRID(ST_Point(%s, %s), 4326)
            LIMIT 1
            """,
            (lon, lat, lon, lat),
        ).fetchone()

        wl = conn.execute(
            f"""
            SELECT id, wetland, name,
                   ST_Distance(geometry::geography, {point_sql}) AS dist_m
            FROM wetland
            ORDER BY geometry <-> ST_SetSRID(ST_Point(%s, %s), 4326)
            LIMIT 1
            """,
            (lon, lat, lon, lat),
        ).fetchone()

    candidates = []
    if ww:
        candidates.append({
            "kind": "waterway", "subtype": ww[1], "name": ww[2],
            "distance_m": float(ww[3]),
        })
    if wz:
        candidates.append({
            "kind": "water_zone", "subtype": wz[1], "name": wz[2],
            "distance_m": float(wz[3]),
        })
    if wl:
        candidates.append({
            "kind": "wetland", "subtype": wl[1], "name": wl[2],
            "distance_m": float(wl[3]),
        })

    nearest = min(candidates, key=lambda c: c["distance_m"]) if candidates else None

    return {
        "lat": lat,
        "lon": lon,
        "nearest": nearest,
        "by_source": {
            "waterway":   next((c for c in candidates if c["kind"] == "waterway"),   None),
            "water_zone": next((c for c in candidates if c["kind"] == "water_zone"), None),
            "wetland":    next((c for c in candidates if c["kind"] == "wetland"),    None),
        },
    }
