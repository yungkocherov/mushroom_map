"""
Districts endpoint: административные районы для выбранного региона.

    GET /api/districts/?region=lenoblast   — FeatureCollection всех районов (level=6)
    GET /api/districts/at?lat=&lon=        — в какой район попадает точка

Районы живут в admin_area (level=6). Используются:
  1. UI: контуры районов на карте + агрегация грибных постов/прогноза по району.
  2. Feature-extractor для prediction-модели: район × день × группа — минимальная
     гранулярность, которая извлекается из текста VK-постов.

При матчинге точки в район — ORDER BY ST_Area ASC LIMIT 1: самый маленький
полигон выигрывает. Это нужно потому, что inner-holes у relations не
обрабатываются (Сосновый Бор как городской округ перекрывается с Ломоносовским).
"""

from fastapi import APIRouter, HTTPException, Query

from api.db import get_conn

router = APIRouter()


@router.get("/")
def list_districts(region: str = Query("lenoblast")) -> dict:
    """Все районы региона как GeoJSON FeatureCollection."""
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT a.id,
                   a.code,
                   a.name_ru,
                   a.name_en,
                   a.meta,
                   ROUND((ST_Area(a.geometry::geography) / 1e6)::numeric, 1) AS area_km2,
                   ST_AsGeoJSON(ST_Centroid(a.geometry))::jsonb AS centroid,
                   ST_AsGeoJSON(a.geometry)::jsonb           AS geometry
            FROM admin_area a
            JOIN region r ON r.id = a.region_id
            WHERE r.code = %s AND a.level = 6
            ORDER BY a.name_ru
            """,
            (region,),
        ).fetchall()

    features = []
    for r in rows:
        area_id, code, name_ru, name_en, meta, area_km2, centroid_json, geom_json = r
        features.append({
            "type": "Feature",
            "id": area_id,
            "geometry": geom_json,
            "properties": {
                "code":       code,
                "name_ru":    name_ru,
                "name_en":    name_en,
                "area_km2":   float(area_km2) if area_km2 is not None else None,
                "centroid":   centroid_json,
                "osm_rel_id": (meta or {}).get("osm_rel_id"),
            },
        })

    return {"type": "FeatureCollection", "features": features}


@router.get("/at")
def district_at(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    region: str = Query("lenoblast"),
) -> dict:
    """В какой район попадает точка. ORDER BY area ASC — меньший выигрывает."""
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT a.id, a.code, a.name_ru, a.name_en,
                   ROUND((ST_Area(a.geometry::geography) / 1e6)::numeric, 1) AS area_km2
            FROM admin_area a
            JOIN region r ON r.id = a.region_id
            WHERE r.code = %s
              AND a.level = 6
              AND ST_Intersects(a.geometry, ST_SetSRID(ST_Point(%s, %s), 4326))
            ORDER BY ST_Area(a.geometry) ASC
            LIMIT 1
            """,
            (region, lon, lat),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="point is outside any district")

    return {
        "lat": lat,
        "lon": lon,
        "district": {
            "id":       row[0],
            "code":     row[1],
            "name_ru":  row[2],
            "name_en":  row[3],
            "area_km2": float(row[4]) if row[4] is not None else None,
        },
    }
