"""
Тесты refresh-токен ротации и reuse-detection.

Это security-критичная часть auth-инфры (Phase 1 D2). Делается так:
  - изготавливаем юзера через fixture auth_user
  - дёргаем services/api/src/api/auth/refresh.py НАПРЯМУЮ через psycopg —
    то же что прод-код, без HTTP-сюрприз; гарантирует что мы тестим
    ровно ту логику которую прод запустит
  - для интеграции через HTTP /api/auth/refresh — тоже один тест,
    подкладывая cookie вручную

Скипается без БД (см. conftest pytest_collection_modifyitems).
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import httpx
import psycopg
import pytest


JWT_SECRET_FOR_HASH = None  # подсоберётся в _hash через conftest.JWT_SECRET


def _hash_token(raw: str, jwt_secret: str) -> str:
    """Зеркало api.auth.refresh._hash_token — peppered SHA-256."""
    h = hashlib.sha256()
    h.update(jwt_secret.encode("utf-8"))
    h.update(b"|")
    h.update(raw.encode("utf-8"))
    return h.hexdigest()


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _issue(conn: psycopg.Connection, user_id, *, jwt_secret: str,
           ttl_seconds: int = 30 * 24 * 3600) -> tuple[str, str, str]:
    """Создать активный refresh — вернуть (raw, hash, family_id)."""
    raw = secrets.token_urlsafe(32)
    h = _hash_token(raw, jwt_secret)
    row = conn.execute(
        """
        INSERT INTO user_refresh_token
            (user_id, token_hash, token_family_id, expires_at)
        VALUES (%s, %s, gen_random_uuid(), %s)
        RETURNING id, token_family_id
        """,
        (user_id, h, _now_utc() + timedelta(seconds=ttl_seconds)),
    ).fetchone()
    conn.commit()
    return raw, h, row[1]


def _alive_in_family(conn: psycopg.Connection, family_id) -> int:
    return conn.execute(
        "SELECT COUNT(*) FROM user_refresh_token WHERE token_family_id=%s AND revoked_at IS NULL",
        (family_id,),
    ).fetchone()[0]


# ── HTTP /api/auth/refresh (cookie round-trip) ────────────────────────────

def test_refresh_rotates_cookie_and_returns_access(
    auth_user: dict,
    db_conn: psycopg.Connection,
) -> None:
    from _test_env import JWT_SECRET, API_BASE
    raw, _, family = _issue(db_conn, auth_user["id"], jwt_secret=JWT_SECRET)

    r = httpx.post(
        f"{API_BASE}/api/auth/refresh",
        cookies={"mm_refresh": raw},
        timeout=5.0,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "access_token" in body
    assert body["token_type"] == "Bearer"
    # Новая cookie выставлена с тем же именем.
    set_cookie = r.headers.get("set-cookie", "")
    assert "mm_refresh=" in set_cookie
    # raw старый теперь revoked
    revoked = db_conn.execute(
        "SELECT revoked_at, revoked_reason FROM user_refresh_token WHERE token_hash=%s",
        (_hash_token(raw, JWT_SECRET),),
    ).fetchone()
    db_conn.commit()
    assert revoked[0] is not None
    assert revoked[1] == "rotated"
    # В family по-прежнему 1 живой (новый).
    assert _alive_in_family(db_conn, family) == 1


def test_refresh_with_no_cookie_returns_401() -> None:
    from _test_env import API_BASE
    r = httpx.post(f"{API_BASE}/api/auth/refresh", timeout=5.0)
    assert r.status_code == 401


def test_refresh_with_unknown_token_returns_401_and_clears_cookie() -> None:
    from _test_env import API_BASE
    fake = secrets.token_urlsafe(32)
    r = httpx.post(
        f"{API_BASE}/api/auth/refresh",
        cookies={"mm_refresh": fake},
        timeout=5.0,
    )
    assert r.status_code == 401
    # Set-Cookie с пустым значением и истёкшей датой — Caddy/Vercel-style
    # «delete cookie». FastAPI/starlette так и делает.
    sc = r.headers.get("set-cookie", "")
    assert "mm_refresh=" in sc
    # Любой из маркеров «удалить»: пустое значение или Max-Age=0.
    assert "Max-Age=0" in sc or 'mm_refresh=""' in sc or "mm_refresh=;" in sc


def test_refresh_reuse_revokes_whole_family(
    auth_user: dict,
    db_conn: psycopg.Connection,
) -> None:
    """Старый revoked-токен на /refresh -> reuse_detected на всю family."""
    from _test_env import JWT_SECRET, API_BASE
    raw1, _, family = _issue(db_conn, auth_user["id"], jwt_secret=JWT_SECRET)

    # Первый legitimate rotate.
    r1 = httpx.post(f"{API_BASE}/api/auth/refresh",
                    cookies={"mm_refresh": raw1}, timeout=5.0)
    assert r1.status_code == 200
    # На этой стадии семья содержит 1 живой токен.
    assert _alive_in_family(db_conn, family) == 1

    # Атакующий попытался переиспользовать ОЛДОВЫЙ raw1.
    r2 = httpx.post(f"{API_BASE}/api/auth/refresh",
                    cookies={"mm_refresh": raw1}, timeout=5.0)
    assert r2.status_code == 401
    # Вся family теперь зачищена — 0 живых.
    db_conn.commit()  # синхронизировать с тем что мог записать API
    assert _alive_in_family(db_conn, family) == 0


def test_refresh_expired_returns_401_without_killing_family(
    auth_user: dict,
    db_conn: psycopg.Connection,
) -> None:
    """Истёкший refresh — 401, но family не отзывается (это не reuse)."""
    from _test_env import JWT_SECRET, API_BASE
    # Issue с прошлым expires_at (через прямой SQL — обходим helper).
    raw = secrets.token_urlsafe(32)
    h = _hash_token(raw, JWT_SECRET)
    row = db_conn.execute(
        """
        INSERT INTO user_refresh_token
            (user_id, token_hash, token_family_id, expires_at)
        VALUES (%s, %s, gen_random_uuid(), %s)
        RETURNING token_family_id
        """,
        (auth_user["id"], h, _now_utc() - timedelta(minutes=1)),
    ).fetchone()
    db_conn.commit()
    family = row[0]

    r = httpx.post(f"{API_BASE}/api/auth/refresh",
                   cookies={"mm_refresh": raw}, timeout=5.0)
    assert r.status_code == 401

    # Токен НЕ помечен как revoked — это просто истёк (revoked_at IS NULL).
    revoked_at = db_conn.execute(
        "SELECT revoked_at FROM user_refresh_token WHERE token_hash=%s",
        (h,),
    ).fetchone()[0]
    db_conn.commit()
    assert revoked_at is None


# ── /api/auth/logout idempotency ──────────────────────────────────────────

def test_logout_revokes_then_idempotent(
    auth_user: dict,
    db_conn: psycopg.Connection,
) -> None:
    from _test_env import JWT_SECRET, API_BASE
    raw, _, _ = _issue(db_conn, auth_user["id"], jwt_secret=JWT_SECRET)

    r1 = httpx.post(f"{API_BASE}/api/auth/logout",
                    cookies={"mm_refresh": raw}, timeout=5.0)
    assert r1.status_code == 204

    revoked_reason = db_conn.execute(
        "SELECT revoked_reason FROM user_refresh_token WHERE token_hash=%s",
        (_hash_token(raw, JWT_SECRET),),
    ).fetchone()[0]
    db_conn.commit()
    assert revoked_reason == "logout"

    # Повторно — всё равно 204 (мягкий logout).
    r2 = httpx.post(f"{API_BASE}/api/auth/logout",
                    cookies={"mm_refresh": raw}, timeout=5.0)
    assert r2.status_code == 204
