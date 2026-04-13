"""
Region endpoints.

    GET /api/regions/                — список активных регионов
    GET /api/regions/{code}          — карточка региона + bbox
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def list_regions() -> list[dict]:
    return []


@router.get("/{code}")
def get_region(code: str) -> dict:
    return {"code": code, "_stub": True}
