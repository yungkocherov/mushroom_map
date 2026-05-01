"""Mobile-app endpoints.

См. `docs/mobile-app-2026-05.md`. Три группы:

    POST /api/mobile/auth/yandex      OAuth code+verifier → device_token
    POST /api/mobile/auth/revoke      logout (best-effort)

    POST /api/mobile/spots/sync       offline-first sync с last-write-wins

    GET  /api/mobile/regions          список 18 районов LO с tile-manifest'ом

Authentication для /spots/sync и будущих защищённых эндпоинтов — через
`Authorization: Bearer <device_token>` (long-lived JWT, выпускается
/auth/yandex). `decode_access_token` принимает device-токены тоже.

Контракт — _stable_, веб не использует. Менять только с bump'ом
`x-api-version` хедера в response (TBD Phase 5).
"""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from api.auth import jwt_tokens, yandex
from api.auth.dependencies import CurrentUser
from api.auth.users import upsert_oauth_user
from api.db import get_conn


router = APIRouter()
log = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────
# /auth/yandex
# ──────────────────────────────────────────────────────────────────────


class MobileYandexAuthRequest(BaseModel):
    code: str = Field(min_length=1, max_length=2048)
    code_verifier: str = Field(min_length=43, max_length=128)
    redirect_uri: str = Field(min_length=1, max_length=512)
    device_id: str = Field(min_length=8, max_length=64)
    device_name: Optional[str] = Field(default=None, max_length=128)


class MobileUserDto(BaseModel):
    id: str
    email: Optional[str]
    name: Optional[str]


class MobileAuthResponse(BaseModel):
    device_token: str
    expires_in: int
    user: MobileUserDto


@router.post("/auth/yandex", response_model=MobileAuthResponse)
def auth_yandex(payload: MobileYandexAuthRequest) -> MobileAuthResponse:
    try:
        token = yandex.exchange_code_mobile(
            code=payload.code,
            code_verifier=payload.code_verifier,
            redirect_uri=payload.redirect_uri,
        )
    except yandex.YandexOAuthError as exc:
        log.warning("mobile yandex token exchange failed: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        userinfo = yandex.fetch_userinfo(token.access_token)
    except yandex.YandexOAuthError as exc:
        log.warning("mobile yandex userinfo fetch failed: %s", exc)
        raise HTTPException(status_code=502, detail="userinfo fetch failed")

    with get_conn() as conn:
        user = upsert_oauth_user(
            conn,
            provider="yandex",
            subject=userinfo.subject,
            email=userinfo.email,
            email_verified=userinfo.email_verified,
            display_name=userinfo.display_name,
            avatar_url=userinfo.avatar_url,
        )
        conn.commit()

    device_token, ttl = jwt_tokens.encode_device_token(user.id, payload.device_id)
    return MobileAuthResponse(
        device_token=device_token,
        expires_in=ttl,
        user=MobileUserDto(
            id=str(user.id),
            email=user.email,
            name=user.display_name,
        ),
    )


@router.post("/auth/revoke", status_code=status.HTTP_204_NO_CONTENT)
def auth_revoke(_user: CurrentUser) -> None:
    # Phase 1 stub: blacklist таблица device-token'ов появится в Phase 2.
    # Сейчас logout = client-side удаление токена; backend всё ещё
    # принимает старый device_token до его естественного expiry.
    # Для прода до релиза — добавить таблицу device_token_revocation
    # с (user_id, device_id, revoked_at) + проверка в decode.
    return None


# ──────────────────────────────────────────────────────────────────────
# /regions
# ──────────────────────────────────────────────────────────────────────


class RegionDto(BaseModel):
    slug: str
    name: str
    bbox: list[float]  # [south, west, north, east]
    layers: list[dict]  # [{name, url, size_bytes, sha256}]
    manifest_version: str


@router.get("/regions")
def list_regions() -> list[RegionDto]:
    """Список 18 районов LO с tile-manifest'ом для download manager.

    Phase 1 stub: возвращает пустой список — фронт показывает «модуль в
    подготовке». Phase 2: pipelines/build_district_tiles.py пишет
    `data/tiles/regions.json`, и этот эндпоинт читает + резолвит URL'ы.
    """
    # TODO(phase-2): прочитать regions.json из tiles_dir, серверу
    # достаточно отдать как есть.
    return []


# ──────────────────────────────────────────────────────────────────────
# /spots/sync
# ──────────────────────────────────────────────────────────────────────


class SpotSyncOp(BaseModel):
    client_uuid: UUID
    op: str = Field(pattern="^(create|update|delete)$")
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lon: Optional[float] = Field(default=None, ge=-180, le=180)
    name: Optional[str] = Field(default=None, max_length=200)
    note: Optional[str] = Field(default=None, max_length=4000)
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    tags: Optional[list[str]] = Field(default=None, max_length=64)
    client_updated_at: int = Field(ge=0)  # Unix ms


class SpotSyncRequest(BaseModel):
    device_id: str = Field(min_length=8, max_length=64)
    last_sync_at: int = Field(default=0, ge=0)
    client_changes: list[SpotSyncOp] = Field(default_factory=list, max_length=500)


class SpotSyncAck(BaseModel):
    client_uuid: str
    server_id: Optional[str] = None
    status: str  # "ok" | "conflict" | "error"
    error: Optional[str] = None


class SpotSyncServerChange(BaseModel):
    client_uuid: Optional[str]
    server_id: str
    op: str  # "upsert" | "delete"
    lat: Optional[float] = None
    lon: Optional[float] = None
    name: Optional[str] = None
    note: Optional[str] = None
    rating: Optional[int] = None
    tags: Optional[list[str]] = None
    server_updated_at: int


class SpotSyncResponse(BaseModel):
    server_changes: list[SpotSyncServerChange]
    ack: list[SpotSyncAck]
    server_now: int


def _ms_to_iso(ms: int) -> str:
    """Helper: psycopg сам положит TIMESTAMPTZ из datetime, но для SQL
    string-литералов нам нужно ISO-8601 — делегируем psycopg-binding'у."""
    from datetime import datetime, timezone
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()


@router.post("/spots/sync", response_model=SpotSyncResponse)
def spots_sync(payload: SpotSyncRequest, user: CurrentUser) -> SpotSyncResponse:
    """Idempotent bulk-sync. last-write-wins по `client_updated_at`.

    Идемпотентность по `client_uuid` — partial UNIQUE индекс
    (см. миграция 031). Повторные `op=create` с тем же uuid → upsert.
    """
    from datetime import datetime, timezone

    ack: list[SpotSyncAck] = []
    with get_conn() as conn:
        for change in payload.client_changes:
            try:
                server_id = _apply_change(conn, user.id, change)
                ack.append(
                    SpotSyncAck(
                        client_uuid=str(change.client_uuid),
                        server_id=str(server_id) if server_id else None,
                        status="ok",
                    )
                )
            except _ConflictError as exc:
                ack.append(
                    SpotSyncAck(
                        client_uuid=str(change.client_uuid),
                        status="conflict",
                        error=str(exc),
                    )
                )
            except Exception as exc:  # noqa: BLE001 — log everything for sync
                log.exception("spot sync change failed")
                ack.append(
                    SpotSyncAck(
                        client_uuid=str(change.client_uuid),
                        status="error",
                        error=str(exc)[:200],
                    )
                )
        conn.commit()

        # Server changes since last_sync_at
        since_iso = _ms_to_iso(payload.last_sync_at)
        rows = conn.execute(
            """
            SELECT id, client_uuid,
                   ST_X(geom) AS lon, ST_Y(geom) AS lat,
                   name, note, rating, tags,
                   updated_at, deleted_at
              FROM user_spot
             WHERE user_id = %s
               AND updated_at > %s::timestamptz
             ORDER BY updated_at ASC
             LIMIT 1000
            """,
            (user.id, since_iso),
        ).fetchall()

    server_changes: list[SpotSyncServerChange] = []
    for sid, cuuid, lon, lat, name, note, rating, tags, upd, deleted in rows:
        # Не отдавать обратно то что прислал клиент в этой же sync-сессии:
        # client_uuid из payload.client_changes уже знаком клиенту.
        sent_uuids = {str(c.client_uuid) for c in payload.client_changes}
        if cuuid is not None and str(cuuid) in sent_uuids:
            continue
        if deleted is not None:
            server_changes.append(
                SpotSyncServerChange(
                    client_uuid=str(cuuid) if cuuid else None,
                    server_id=str(sid),
                    op="delete",
                    server_updated_at=int(upd.timestamp() * 1000),
                )
            )
        else:
            server_changes.append(
                SpotSyncServerChange(
                    client_uuid=str(cuuid) if cuuid else None,
                    server_id=str(sid),
                    op="upsert",
                    lat=float(lat),
                    lon=float(lon),
                    name=name,
                    note=note,
                    rating=int(rating),
                    tags=list(tags) if tags else [],
                    server_updated_at=int(upd.timestamp() * 1000),
                )
            )

    return SpotSyncResponse(
        server_changes=server_changes,
        ack=ack,
        server_now=int(datetime.now(tz=timezone.utc).timestamp() * 1000),
    )


class _ConflictError(Exception):
    pass


def _apply_change(conn, user_id, change: SpotSyncOp) -> Optional[UUID]:
    client_iso = _ms_to_iso(change.client_updated_at)
    if change.op == "delete":
        row = conn.execute(
            """
            UPDATE user_spot
               SET deleted_at = now(),
                   updated_at = now(),
                   client_updated_at = %s::timestamptz
             WHERE user_id = %s AND client_uuid = %s
               AND (client_updated_at IS NULL OR client_updated_at < %s::timestamptz)
             RETURNING id
            """,
            (client_iso, user_id, change.client_uuid, client_iso),
        ).fetchone()
        return row[0] if row else None

    if change.lat is None or change.lon is None:
        raise ValueError("create/update requires lat/lon")
    tags = _normalize_tags(change.tags or [])

    # UPSERT by client_uuid. ON CONFLICT — last-write-wins by client_updated_at.
    row = conn.execute(
        """
        INSERT INTO user_spot
            (user_id, client_uuid, name, note, rating, tags, geom,
             client_updated_at, updated_at)
        VALUES
            (%s, %s, %s, %s, %s, %s,
             ST_SetSRID(ST_MakePoint(%s, %s), 4326),
             %s::timestamptz, now())
        ON CONFLICT (client_uuid) WHERE client_uuid IS NOT NULL DO UPDATE
            SET name = EXCLUDED.name,
                note = EXCLUDED.note,
                rating = EXCLUDED.rating,
                tags = EXCLUDED.tags,
                geom = EXCLUDED.geom,
                client_updated_at = EXCLUDED.client_updated_at,
                updated_at = now(),
                deleted_at = NULL
            WHERE user_spot.user_id = EXCLUDED.user_id
              AND (user_spot.client_updated_at IS NULL
                   OR user_spot.client_updated_at < EXCLUDED.client_updated_at)
        RETURNING id
        """,
        (
            user_id,
            change.client_uuid,
            change.name or "",
            change.note or "",
            change.rating or 3,
            tags,
            change.lon,
            change.lat,
            client_iso,
        ),
    ).fetchone()
    if row is None:
        # ON CONFLICT WHERE filtered out → it's a stale write
        raise _ConflictError("server has newer version")
    return row[0]


def _normalize_tags(raw: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for t in raw:
        s = t.strip()[:64]
        if s and s not in seen:
            seen.add(s)
            out.append(s)
    return out
