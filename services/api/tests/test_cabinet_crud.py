"""
Cabinet CRUD — happy-path и изоляция между юзерами.

Использует conftest.py: auth_user / access_token / cabinet_client.
Скипается если БД или API недоступны (см. conftest pytest_collection_modifyitems).
"""

from __future__ import annotations

import httpx
import pytest


def _spot_payload(name: str = "Поляна за Лемболово", **kwargs) -> dict:
    return {
        "name": name,
        "note": "Белые в августе",
        "rating": 4,
        "lat": 60.31,
        "lon": 30.21,
        **kwargs,
    }


# ── happy path ────────────────────────────────────────────────────────────

def test_list_starts_empty(cabinet_client: httpx.Client) -> None:
    r = cabinet_client.get("/api/cabinet/spots")
    assert r.status_code == 200
    assert r.json() == []


def test_create_then_list(cabinet_client: httpx.Client) -> None:
    r1 = cabinet_client.post("/api/cabinet/spots", json=_spot_payload())
    assert r1.status_code == 201
    body = r1.json()
    for k in ("id", "name", "note", "rating", "lat", "lon", "created_at"):
        assert k in body
    assert body["rating"] == 4
    assert body["lat"] == 60.31 and body["lon"] == 30.21

    r2 = cabinet_client.get("/api/cabinet/spots")
    assert r2.status_code == 200
    items = r2.json()
    assert len(items) == 1
    assert items[0]["id"] == body["id"]


def test_patch_renames_spot(cabinet_client: httpx.Client) -> None:
    created = cabinet_client.post("/api/cabinet/spots", json=_spot_payload()).json()
    sid = created["id"]

    r = cabinet_client.patch(f"/api/cabinet/spots/{sid}", json={"name": "Новое имя"})
    assert r.status_code == 200
    assert r.json()["name"] == "Новое имя"
    assert r.json()["lat"] == created["lat"]  # не трогалась


def test_patch_rejects_invalid_rating(cabinet_client: httpx.Client) -> None:
    sid = cabinet_client.post("/api/cabinet/spots", json=_spot_payload()).json()["id"]
    # 0, 6, 99 — все вне диапазона 1..5; Pydantic Field(ge=1, le=5) → 422
    r = cabinet_client.patch(f"/api/cabinet/spots/{sid}", json={"rating": 6})
    assert r.status_code == 422
    r = cabinet_client.patch(f"/api/cabinet/spots/{sid}", json={"rating": 0})
    assert r.status_code == 422


def test_patch_empty_payload_rejected(cabinet_client: httpx.Client) -> None:
    sid = cabinet_client.post("/api/cabinet/spots", json=_spot_payload()).json()["id"]
    r = cabinet_client.patch(f"/api/cabinet/spots/{sid}", json={})
    assert r.status_code == 400  # "no fields to update"


def test_delete_then_404(cabinet_client: httpx.Client) -> None:
    sid = cabinet_client.post("/api/cabinet/spots", json=_spot_payload()).json()["id"]
    r1 = cabinet_client.delete(f"/api/cabinet/spots/{sid}")
    assert r1.status_code == 204
    # Повторный delete → 404
    r2 = cabinet_client.delete(f"/api/cabinet/spots/{sid}")
    assert r2.status_code == 404


# ── валидация координат / тела ───────────────────────────────────────────

def test_create_rejects_lat_out_of_range(cabinet_client: httpx.Client) -> None:
    r = cabinet_client.post("/api/cabinet/spots", json=_spot_payload(lat=91))
    assert r.status_code == 422


def test_create_rejects_empty_name(cabinet_client: httpx.Client) -> None:
    r = cabinet_client.post("/api/cabinet/spots", json=_spot_payload(name=""))
    assert r.status_code == 422


def test_create_rejects_invalid_rating(cabinet_client: httpx.Client) -> None:
    # Out of range — Pydantic ge/le даёт 422.
    r = cabinet_client.post("/api/cabinet/spots", json=_spot_payload(rating=6))
    assert r.status_code == 422
    r = cabinet_client.post("/api/cabinet/spots", json=_spot_payload(rating=0))
    assert r.status_code == 422


# ── изоляция между юзерами ───────────────────────────────────────────────

def test_user_a_cannot_see_user_b_spots(
    cabinet_client: httpx.Client,
    db_conn,
) -> None:
    """User A создаёт spot, делаем второго юзера, у него пусто."""
    import jwt as pyjwt, time, uuid
    from _test_env import JWT_SECRET, JWT_ISSUER, API_BASE

    cabinet_client.post("/api/cabinet/spots", json=_spot_payload()).raise_for_status()
    assert len(cabinet_client.get("/api/cabinet/spots").json()) == 1

    # Делаем второго юзера руками + токен (тот же путь что фикстура).
    sub_b = f"pytest-b-{uuid.uuid4().hex[:8]}"
    row = db_conn.execute(
        """
        INSERT INTO users (auth_provider, provider_subject, email, display_name)
        VALUES ('yandex', %s, %s, 'B')
        RETURNING id
        """,
        (sub_b, f"{sub_b}@pytest.local"),
    ).fetchone()
    db_conn.commit()
    uid_b = row[0]
    try:
        now = int(time.time())
        tok_b = pyjwt.encode(
            {"iss": JWT_ISSUER, "sub": str(uid_b), "iat": now, "exp": now + 900, "typ": "access"},
            JWT_SECRET, algorithm="HS256",
        )
        with httpx.Client(base_url=API_BASE, timeout=5.0,
                          headers={"Authorization": f"Bearer {tok_b}"}) as cb:
            r = cb.get("/api/cabinet/spots")
            assert r.status_code == 200
            assert r.json() == []
    finally:
        db_conn.execute("DELETE FROM users WHERE id = %s", (uid_b,))
        db_conn.commit()


def test_patch_someone_elses_spot_returns_404(
    cabinet_client: httpx.Client,
    db_conn,
) -> None:
    """User A создаёт spot. User B пытается переименовать по ID — 404
    (а не 403/200)."""
    import jwt as pyjwt, time, uuid
    from _test_env import JWT_SECRET, JWT_ISSUER, API_BASE

    sid = cabinet_client.post("/api/cabinet/spots", json=_spot_payload()).json()["id"]

    sub_b = f"pytest-c-{uuid.uuid4().hex[:8]}"
    row = db_conn.execute(
        """
        INSERT INTO users (auth_provider, provider_subject, email, display_name)
        VALUES ('yandex', %s, %s, 'C')
        RETURNING id
        """,
        (sub_b, f"{sub_b}@pytest.local"),
    ).fetchone()
    db_conn.commit()
    uid_b = row[0]
    try:
        now = int(time.time())
        tok_b = pyjwt.encode(
            {"iss": JWT_ISSUER, "sub": str(uid_b), "iat": now, "exp": now + 900, "typ": "access"},
            JWT_SECRET, algorithm="HS256",
        )
        with httpx.Client(base_url=API_BASE, timeout=5.0,
                          headers={"Authorization": f"Bearer {tok_b}"}) as cb:
            r = cb.patch(f"/api/cabinet/spots/{sid}", json={"name": "украдено"})
            assert r.status_code == 404
            r = cb.delete(f"/api/cabinet/spots/{sid}")
            assert r.status_code == 404
    finally:
        db_conn.execute("DELETE FROM users WHERE id = %s", (uid_b,))
        db_conn.commit()


# ── access-token edge cases ──────────────────────────────────────────────

def test_expired_access_token_rejected(auth_user: dict) -> None:
    import jwt as pyjwt, time
    from _test_env import JWT_SECRET, JWT_ISSUER, API_BASE

    # Токен с exp в прошлом.
    now = int(time.time())
    expired = pyjwt.encode(
        {"iss": JWT_ISSUER, "sub": str(auth_user["id"]),
         "iat": now - 3600, "exp": now - 60, "typ": "access"},
        JWT_SECRET, algorithm="HS256",
    )
    r = httpx.get(
        f"{API_BASE}/api/cabinet/spots",
        headers={"Authorization": f"Bearer {expired}"},
        timeout=5.0,
    )
    assert r.status_code == 401


def test_wrong_typ_claim_rejected(auth_user: dict) -> None:
    """access-эндпоинт не должен принимать токен с typ != 'access'."""
    import jwt as pyjwt, time
    from _test_env import JWT_SECRET, JWT_ISSUER, API_BASE

    now = int(time.time())
    bad = pyjwt.encode(
        {"iss": JWT_ISSUER, "sub": str(auth_user["id"]),
         "iat": now, "exp": now + 900, "typ": "oauth_state"},
        JWT_SECRET, algorithm="HS256",
    )
    r = httpx.get(
        f"{API_BASE}/api/cabinet/spots",
        headers={"Authorization": f"Bearer {bad}"},
        timeout=5.0,
    )
    assert r.status_code == 401
