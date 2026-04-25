"""Cabinet endpoints — приватные данные юзера.

    GET    /api/cabinet/spots          -> список своих spots
    POST   /api/cabinet/spots          -> создать spot
    PATCH  /api/cabinet/spots/{id}     -> переименовать / поправить заметку / цвет
    DELETE /api/cabinet/spots/{id}     -> удалить spot

Все эндпоинты требуют CurrentUser; spot всегда привязан к user_id из
JWT'а — клиент не может ни прочитать, ни тронуть чужие spots даже
если знает их UUID.

Координаты валидируются: lat ∈ [-90, 90], lon ∈ [-180, 180]. Дальше —
не имеет смысла резать по bbox ЛО: юзеры могут сохранять что угодно
(съездил в Карелию — пометил), серверу всё равно.
"""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from api.auth.dependencies import CurrentUser
from api.db import get_conn


router = APIRouter()


# ──────────────────────────────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────────────────────────────

ALLOWED_COLORS = {"forest", "chanterelle", "birch", "moss", "danger"}


class SpotCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    note: str = Field(default="", max_length=4000)
    color: str = Field(default="forest")
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class SpotPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    note: Optional[str] = Field(default=None, max_length=4000)
    color: Optional[str] = Field(default=None)


def _row_to_spot(row: tuple) -> dict:
    sid, name, note, color, lon, lat, created_at, updated_at = row
    return {
        "id":         str(sid),
        "name":       name,
        "note":       note,
        "color":      color,
        "lat":        float(lat),
        "lon":        float(lon),
        "created_at": created_at.isoformat(),
        "updated_at": updated_at.isoformat(),
    }


_SELECT_COLUMNS = """
    id, name, note, color,
    ST_X(geom) AS lon, ST_Y(geom) AS lat,
    created_at, updated_at
"""


# ──────────────────────────────────────────────────────────────────────
# List
# ──────────────────────────────────────────────────────────────────────

@router.get("/spots")
def list_spots(user: CurrentUser) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            f"""
            SELECT {_SELECT_COLUMNS}
            FROM user_spot
            WHERE user_id = %s
            ORDER BY created_at DESC
            """,
            (user.id,),
        ).fetchall()
    return [_row_to_spot(r) for r in rows]


# ──────────────────────────────────────────────────────────────────────
# Create
# ──────────────────────────────────────────────────────────────────────

@router.post("/spots", status_code=status.HTTP_201_CREATED)
def create_spot(payload: SpotCreate, user: CurrentUser) -> dict:
    if payload.color not in ALLOWED_COLORS:
        raise HTTPException(
            status_code=400,
            detail=f"color must be one of: {sorted(ALLOWED_COLORS)}",
        )
    with get_conn() as conn:
        row = conn.execute(
            f"""
            INSERT INTO user_spot (user_id, name, note, color, geom)
            VALUES (%s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326))
            RETURNING {_SELECT_COLUMNS}
            """,
            (user.id, payload.name, payload.note, payload.color,
             payload.lon, payload.lat),
        ).fetchone()
        conn.commit()
    return _row_to_spot(row)


# ──────────────────────────────────────────────────────────────────────
# Patch
# ──────────────────────────────────────────────────────────────────────

@router.patch("/spots/{spot_id}")
def patch_spot(spot_id: UUID, payload: SpotPatch, user: CurrentUser) -> dict:
    fields: list[str] = []
    values: list = []
    if payload.name is not None:
        fields.append("name = %s")
        values.append(payload.name)
    if payload.note is not None:
        fields.append("note = %s")
        values.append(payload.note)
    if payload.color is not None:
        if payload.color not in ALLOWED_COLORS:
            raise HTTPException(
                status_code=400,
                detail=f"color must be one of: {sorted(ALLOWED_COLORS)}",
            )
        fields.append("color = %s")
        values.append(payload.color)

    if not fields:
        raise HTTPException(status_code=400, detail="no fields to update")

    fields.append("updated_at = now()")
    values.extend([spot_id, user.id])

    with get_conn() as conn:
        row = conn.execute(
            f"""
            UPDATE user_spot
               SET {", ".join(fields)}
             WHERE id = %s AND user_id = %s
             RETURNING {_SELECT_COLUMNS}
            """,
            tuple(values),
        ).fetchone()
        conn.commit()

    if row is None:
        raise HTTPException(status_code=404, detail="spot not found")
    return _row_to_spot(row)


# ──────────────────────────────────────────────────────────────────────
# Delete
# ──────────────────────────────────────────────────────────────────────

@router.delete("/spots/{spot_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_spot(spot_id: UUID, user: CurrentUser) -> None:
    with get_conn() as conn:
        cur = conn.execute(
            "DELETE FROM user_spot WHERE id = %s AND user_id = %s",
            (spot_id, user.id),
        )
        conn.commit()
    if cur.rowcount == 0:
        # Можно было бы 404 не отдавать (idempotent delete), но
        # информативнее сказать «нет такого/не твой».
        raise HTTPException(status_code=404, detail="spot not found")
