"""Cabinet endpoints — приватные данные юзера.

    GET    /api/cabinet/spots          -> список своих spots
    POST   /api/cabinet/spots          -> создать spot
    PATCH  /api/cabinet/spots/{id}     -> переименовать / поправить заметку / rating
    DELETE /api/cabinet/spots/{id}     -> удалить spot

Все эндпоинты требуют CurrentUser; spot всегда привязан к user_id из
JWT'а — клиент не может ни прочитать, ни тронуть чужие spots даже
если знает их UUID.

Координаты валидируются: lat ∈ [-90, 90], lon ∈ [-180, 180]. Дальше —
не имеет смысла резать по bbox ЛО: юзеры могут сохранять что угодно
(съездил в Карелию — пометил), серверу всё равно.

`rating` — 1..5 оценка качества места. Цвет маркера на карте — производная
от rating (см. apps/web/src/lib/spotRating.ts). Pydantic Field(ge=1, le=5)
дублирует CHECK constraint в db/migrations/030_user_spot_rating.sql.
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


class SpotCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    note: str = Field(default="", max_length=4000)
    rating: int = Field(default=3, ge=1, le=5)
    tags: list[str] = Field(default_factory=list, max_length=64)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class SpotPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    note: Optional[str] = Field(default=None, max_length=4000)
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    tags: Optional[list[str]] = Field(default=None, max_length=64)


def _row_to_spot(row: tuple) -> dict:
    sid, name, note, rating, tags, lon, lat, created_at, updated_at = row
    return {
        "id":         str(sid),
        "name":       name,
        "note":       note,
        "rating":     int(rating),
        "tags":       list(tags) if tags else [],
        "lat":        float(lat),
        "lon":        float(lon),
        "created_at": created_at.isoformat(),
        "updated_at": updated_at.isoformat(),
    }


_SELECT_COLUMNS = """
    id, name, note, rating, tags,
    ST_X(geom) AS lon, ST_Y(geom) AS lat,
    created_at, updated_at
"""


def _normalize_tags(raw: list[str]) -> list[str]:
    """Дедуп + триминг + cap длины каждого slug'а. Никакой word-list-validation
    на сервере: словарь живёт во фронте (apps/web/src/lib/spotTags.ts), сервер
    лишь хранит. Добавление нового вида в UI не требует деплоя API."""
    seen: set[str] = set()
    out: list[str] = []
    for t in raw:
        s = t.strip()[:64]
        if s and s not in seen:
            seen.add(s)
            out.append(s)
    return out


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
            WHERE user_id = %s AND deleted_at IS NULL
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
    tags = _normalize_tags(payload.tags)
    with get_conn() as conn:
        row = conn.execute(
            f"""
            INSERT INTO user_spot (user_id, name, note, rating, tags, geom)
            VALUES (%s, %s, %s, %s, %s,
                    ST_SetSRID(ST_MakePoint(%s, %s), 4326))
            RETURNING {_SELECT_COLUMNS}
            """,
            (user.id, payload.name, payload.note, payload.rating, tags,
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
    if payload.rating is not None:
        fields.append("rating = %s")
        values.append(payload.rating)
    if payload.tags is not None:
        fields.append("tags = %s")
        values.append(_normalize_tags(payload.tags))

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
