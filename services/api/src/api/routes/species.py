"""
Species endpoints.

    GET /api/species/search?q=белый&limit=10
        Search species by name_ru (case-insensitive ILIKE %q%).
        Returns: list of {slug, name_ru, name_lat, edibility, season_months, forest_types}

    GET /api/species/{slug}/forests
        Forest types (dominant_species values) where this species has affinity,
        ordered by affinity DESC.
        Returns: {slug, name_ru, forest_types: [{forest_type, affinity}]}
"""

from fastapi import APIRouter, HTTPException, Query

from api.db import get_conn

router = APIRouter()


@router.get("/search")
def search_species(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=20),
) -> list[dict]:
    """Search species by Russian name (case-insensitive substring match)."""
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT s.id, s.slug, s.name_ru, s.name_lat, s.edibility, s.season_months
            FROM species s
            WHERE s.name_ru ILIKE %s
            ORDER BY s.name_ru
            LIMIT %s
            """,
            (f"%{q}%", limit),
        ).fetchall()

        result = []
        for row in rows:
            species_id, slug, name_ru, name_lat, edibility, season_months = row

            forest_type_rows = conn.execute(
                """
                SELECT forest_type
                FROM species_forest_affinity
                WHERE species_id = %s
                GROUP BY forest_type
                ORDER BY MAX(affinity) DESC
                LIMIT 5
                """,
                (species_id,),
            ).fetchall()

            result.append(
                {
                    "slug": slug,
                    "name_ru": name_ru,
                    "name_lat": name_lat,
                    "edibility": edibility,
                    "season_months": season_months,
                    "forest_types": [r[0] for r in forest_type_rows],
                }
            )

    return result


@router.get("/{slug}/forests")
def species_forests(slug: str) -> dict:
    """Return forest types where the given species has affinity, ordered by affinity DESC."""
    with get_conn() as conn:
        species_row = conn.execute(
            "SELECT id, name_ru FROM species WHERE slug = %s",
            (slug,),
        ).fetchone()

        if species_row is None:
            raise HTTPException(status_code=404, detail=f"Species '{slug}' not found")

        species_id, name_ru = species_row

        forest_rows = conn.execute(
            """
            SELECT forest_type, affinity
            FROM species_forest_affinity
            WHERE species_id = %s
            ORDER BY affinity DESC
            """,
            (species_id,),
        ).fetchall()

    return {
        "slug": slug,
        "name_ru": name_ru,
        "forest_types": [
            {"forest_type": r[0], "affinity": float(r[1])} for r in forest_rows
        ],
    }
