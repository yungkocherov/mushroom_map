"""
Forest endpoints.

    GET /api/forest/at?lat=&lon=
        Вернуть тип леса в точке + доминирующую породу + точную смесь
        (если есть из Copernicus) + список видов грибов: теоретических и
        эмпирических (агрегация по H3 ячейке).
"""

from fastapi import APIRouter, Query

from api.db import get_conn

router = APIRouter()


@router.get("/at")
def forest_at(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
) -> dict:
    with get_conn() as conn:
        # Наименьший содержащий полигон = наиболее специфичный
        row = conn.execute(
            """
            SELECT dominant_species, species_composition, source, confidence, area_m2
            FROM forest_polygon
            WHERE ST_Intersects(geometry, ST_SetSRID(ST_Point(%s, %s), 4326))
            ORDER BY area_m2 ASC
            LIMIT 1
            """,
            (lon, lat),
        ).fetchone()

        if row is None:
            return {
                "lat": lat,
                "lon": lon,
                "forest": None,
                "species_theoretical": [],
                "species_empirical": [],
            }

        dominant_species: str = row[0]

        species_rows = conn.execute(
            """
            SELECT s.slug, s.name_ru, s.name_lat, s.edibility,
                   s.season_months, sfa.affinity
            FROM species_forest_affinity sfa
            JOIN species s ON s.id = sfa.species_id
            WHERE sfa.forest_type = %s
            ORDER BY sfa.affinity DESC
            """,
            (dominant_species,),
        ).fetchall()

    return {
        "lat": lat,
        "lon": lon,
        "forest": {
            "dominant_species": row[0],
            "species_composition": row[1],
            "source": row[2],
            "confidence": float(row[3]),
            "area_m2": float(row[4]) if row[4] is not None else None,
        },
        "species_theoretical": [
            {
                "slug": s[0],
                "name_ru": s[1],
                "name_lat": s[2],
                "edibility": s[3],
                "season_months": s[4],
                "affinity": float(s[5]),
            }
            for s in species_rows
        ],
        "species_empirical": [],
    }
