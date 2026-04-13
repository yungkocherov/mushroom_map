"""
Species endpoints.

    GET /api/species/                — список всех видов
    GET /api/species/{slug}          — карточка вида
    GET /api/species/{slug}/forests  — типы леса, где встречается, с affinity
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def list_species() -> list[dict]:
    """TODO: SELECT * FROM species ORDER BY name_ru."""
    return []


@router.get("/{slug}")
def get_species(slug: str) -> dict:
    """TODO: SELECT ... FROM species WHERE slug=%s."""
    return {"slug": slug, "_stub": True}
