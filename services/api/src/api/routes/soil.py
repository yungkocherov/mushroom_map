"""
Soil endpoint: тип почвы в точке + ближайший точечный разрез.

    GET /api/soil/at?lat=&lon=

Используется как:
  1. UI: попап «что под ногами» (название почвы, порода, ближайший разрез с pH).
  2. Feature-extractor для prediction-модели в sister-репо ik_mushrooms_parser.
     Возвращает категориальные (zone, soil0_descript) и числовые (ph_h2o, corg)
     поля одним вызовом.
"""

from fastapi import APIRouter, Query

from api.db import get_conn

router = APIRouter()


@router.get("/at")
def soil_at(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    profile_radius_km: float = Query(50.0, gt=0, le=500),
) -> dict:
    """Почва под точкой + ближайший разрез в радиусе profile_radius_km."""
    with get_conn() as conn:
        # Полигон, в который попадает точка. Один полигон может содержать
        # почвенный комплекс — soil0 = основная, soil1/2/3 = сопутствующие.
        poly = conn.execute(
            """
            SELECT p.poligon_id,
                   p.soil0_id, t0.symbol, t0.descript, t0.zone,
                   p.soil1_id, t1.descript,
                   p.soil2_id, t2.descript,
                   p.soil3_id, t3.descript,
                   p.parent1_id, pa1.name,
                   p.parent2_id, pa2.name,
                   p.area_m2
            FROM soil_polygon p
            LEFT JOIN soil_type   t0  ON t0.soil_id    = p.soil0_id
            LEFT JOIN soil_type   t1  ON t1.soil_id    = p.soil1_id
            LEFT JOIN soil_type   t2  ON t2.soil_id    = p.soil2_id
            LEFT JOIN soil_type   t3  ON t3.soil_id    = p.soil3_id
            LEFT JOIN soil_parent pa1 ON pa1.parent_id = p.parent1_id
            LEFT JOIN soil_parent pa2 ON pa2.parent_id = p.parent2_id
            WHERE ST_Intersects(p.geometry, ST_SetSRID(ST_Point(%s, %s), 4326))
            ORDER BY p.area_m2 ASC
            LIMIT 1
            """,
            (lon, lat),
        ).fetchone()

        # Ближайший точечный разрез (geography для метров).
        prof = conn.execute(
            """
            SELECT pr.card_id, pr.rusm, pr.wrb06, pr.rureg, pr.location,
                   pr.landuse, pr.veg_assoc,
                   pr.ph_h2o, pr.ph_salt, pr.corg, pr.altitude_m,
                   pr.horizons,
                   ST_Distance(
                       pr.geom::geography,
                       ST_SetSRID(ST_Point(%s, %s), 4326)::geography
                   ) / 1000.0 AS distance_km
            FROM soil_profile pr
            WHERE ST_DWithin(
                pr.geom::geography,
                ST_SetSRID(ST_Point(%s, %s), 4326)::geography,
                %s
            )
            ORDER BY pr.geom <-> ST_SetSRID(ST_Point(%s, %s), 4326)
            LIMIT 1
            """,
            (lon, lat, lon, lat, profile_radius_km * 1000.0, lon, lat),
        ).fetchone()

    return {
        "lat": lat,
        "lon": lon,
        "polygon": (
            None if poly is None else {
                "poligon_id":      poly[0],
                "soil0":  {"id": poly[1], "symbol": poly[2], "descript": poly[3], "zone": poly[4]},
                "soil1":  None if poly[5] is None else {"id": poly[5], "descript": poly[6]},
                "soil2":  None if poly[7] is None else {"id": poly[7], "descript": poly[8]},
                "soil3":  None if poly[9] is None else {"id": poly[9], "descript": poly[10]},
                "parent1": None if poly[11] is None else {"id": poly[11], "name": poly[12]},
                "parent2": None if poly[13] is None else {"id": poly[13], "name": poly[14]},
                "area_m2": float(poly[15]) if poly[15] is not None else None,
            }
        ),
        "profile_nearest": (
            None if prof is None else {
                "card_id":     prof[0],
                "rusm":        prof[1],
                "wrb06":       prof[2],
                "rureg":       prof[3],
                "location":    prof[4],
                "landuse":     prof[5],
                "veg_assoc":   prof[6],
                "ph_h2o":      float(prof[7])  if prof[7]  is not None else None,
                "ph_salt":     float(prof[8])  if prof[8]  is not None else None,
                "corg":        float(prof[9])  if prof[9]  is not None else None,
                "altitude_m":  float(prof[10]) if prof[10] is not None else None,
                "horizons":    prof[11],
                "distance_km": float(prof[12]),
            }
        ),
    }
