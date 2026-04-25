"""
Forest endpoints.

    GET /api/forest/at?lat=&lon=
        Тип леса в точке + доминирующая порода + species_composition
        (если из Copernicus) + теоретические виды грибов из affinity.

Раньше также возвращал `species_empirical` — агрегаты по mat-views
`observation_h3_species_stats` и `observation_region_species_stats`.
Эти view'хи мёртвые с тех пор как Stage-4 ингеста VK не дошёл до
`observation`-таблицы (см. CLAUDE.md «Deprecated»). Удалено
2026-04-25 — две лишние SQL-операции на каждый клик карты.
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
        # forest_unified — каскад источников (rosleshoz > copernicus > terranorte > osm).
        # Сначала по приоритету источника (точные данные > грубые),
        # при равном приоритете — наименьший полигон как наиболее специфичный.
        row = conn.execute(
            """
            SELECT fu.dominant_species, fu.species_composition, fu.source,
                   fu.confidence, fu.area_m2,
                   (fp.meta->>'bonitet')::int       AS bonitet,
                   (fp.meta->>'timber_stock')::real AS timber_stock,
                   fp.meta->>'age_group'            AS age_group
            FROM forest_unified fu
            JOIN forest_polygon fp ON fp.id = fu.id
            WHERE ST_Intersects(fu.geometry, ST_SetSRID(ST_Point(%s, %s), 4326))
            ORDER BY fu.source_priority DESC, fu.area_m2 ASC
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
            "bonitet": int(row[5]) if row[5] is not None else None,
            "timber_stock": float(row[6]) if row[6] is not None else None,
            "age_group": row[7],
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
    }
