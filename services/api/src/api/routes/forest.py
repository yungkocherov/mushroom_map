"""
Forest endpoints.

    GET /api/forest/at?lat=&lon=
        Вернуть тип леса в точке + доминирующую породу + точную смесь
        (если есть из Copernicus) + список видов грибов: теоретических и
        эмпирических (агрегация по H3 ячейке или региону).
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
                "species_empirical": [],
            }

        dominant_species: str = row[0]

        # ── Теоретические виды (афинность к типу леса) ─────────────────────
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

        # ── Эмпирические виды из наблюдений ВК ─────────────────────────────
        #
        # Приоритет 1: H3-ячейка (если наблюдения были геопривязаны через NER/газеттир).
        # Приоритет 2: региональная агрегация — данные всего региона.
        #
        # Сначала пробуем H3 (работает когда observation.h3_cell заполнен)
        empirical_rows = conn.execute(
            """
            SELECT s.slug, s.name_ru, s.name_lat, s.edibility,
                   s.season_months,
                   SUM(st.n_observations)            AS n_obs,
                   COUNT(DISTINCT st.observed_month) AS n_months,
                   MAX(st.last_seen)                 AS last_seen
            FROM observation_h3_species_stats st
            JOIN species s ON s.id = st.species_id
            JOIN region  r ON r.id = st.region_id
            WHERE ST_Intersects(
                r.geometry,
                ST_SetSRID(ST_Point(%s, %s), 4326)
            )
            GROUP BY s.slug, s.name_ru, s.name_lat, s.edibility, s.season_months
            ORDER BY n_obs DESC
            LIMIT 15
            """,
            (lon, lat),
        ).fetchall()

        # Если H3 не дал результатов — берём региональные данные
        if not empirical_rows:
            empirical_rows = conn.execute(
                """
                SELECT s.slug, s.name_ru, s.name_lat, s.edibility,
                       s.season_months,
                       SUM(st.n_observations)            AS n_obs,
                       COUNT(DISTINCT st.observed_month) AS n_months,
                       MAX(st.last_seen)                 AS last_seen
                FROM observation_region_species_stats st
                JOIN species s ON s.id = st.species_id
                JOIN region  r ON r.id = st.region_id
                WHERE ST_Intersects(
                    r.geometry,
                    ST_SetSRID(ST_Point(%s, %s), 4326)
                )
                GROUP BY s.slug, s.name_ru, s.name_lat, s.edibility, s.season_months
                ORDER BY n_obs DESC
                LIMIT 15
                """,
                (lon, lat),
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
        "species_empirical": [
            {
                "slug": e[0],
                "name_ru": e[1],
                "name_lat": e[2],
                "edibility": e[3],
                "season_months": e[4],
                "n_observations": int(e[5]),
                "last_seen": e[7].isoformat() if e[7] else None,
            }
            for e in empirical_rows
        ],
    }
