"""Refresh-token operations: generate, hash, persist, rotate, revoke.

Высокоуровневые инварианты:

- raw refresh-token никогда не кладётся в БД. В `user_refresh_token.token_hash`
  пишется `SHA-256(jwt_secret || raw)` — `jwt_secret` выступает pepper'ом,
  так что даже утёкший дамп БД бесполезен без него.
- Каждый успешный `/refresh` — rotate: старую строку ставим `revoked_at=now`,
  `revoked_reason='rotated'`, `replaced_by_id=<новый>`. Новая строка
  наследует `token_family_id`.
- Если на `/refresh` приходит уже-revoked токен — это reuse (куку украли),
  revoke'ом всей family ломаем злоумышленнику сессию. Пользователя
  это тоже разлогинит, но это правильная семантика (OWASP refresh-token
  rotation с reuse detection).
"""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID, uuid4

import psycopg

from api.settings import settings


# Имя cookie с raw-refresh-токеном. SameSite=Lax + path=/api/auth покрывает
# все auth-эндпоинты (login/callback/refresh/logout) и отсекает межсайтовые
# GET'ы из браузера.
REFRESH_COOKIE_NAME = "mm_refresh"
REFRESH_COOKIE_PATH = "/api/auth"


def _hash_token(raw: str) -> str:
    """Peppered SHA-256: secret как pepper, чтобы read-only-дамп БД
    не давал возможности превратить hash в lookup-ключ."""
    mac = hashlib.sha256()
    mac.update(settings.jwt_secret.encode("utf-8"))
    mac.update(b"|")
    mac.update(raw.encode("utf-8"))
    return mac.hexdigest()


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class NewRefreshToken:
    """Результат issue_/rotate_refresh_token."""
    id: UUID
    token_family_id: UUID
    raw: str              # единственное место где существует raw — вернуть фронту
    expires_at: datetime


def _generate_raw() -> str:
    """43 символа base64url → 256 бит энтропии."""
    return secrets.token_urlsafe(32)


# ──────────────────────────────────────────────────────────────────────
# Issue (первый токен после OAuth-callback)
# ──────────────────────────────────────────────────────────────────────

def issue_refresh_token(
    conn: psycopg.Connection,
    user_id: UUID,
    *,
    client_ua: Optional[str] = None,
    client_ip: Optional[str] = None,
) -> NewRefreshToken:
    """Выдать свежий refresh-токен с новой family. Вызывается из
    `/yandex/callback` (первый login) и может вызываться админкой
    для служебного сброса сессий."""
    raw = _generate_raw()
    token_hash = _hash_token(raw)
    family_id = uuid4()
    expires_at = _now_utc() + timedelta(seconds=settings.refresh_token_ttl_seconds)

    row = conn.execute(
        """
        INSERT INTO user_refresh_token
            (user_id, token_hash, token_family_id, expires_at,
             client_ua, client_ip)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (user_id, token_hash, family_id, expires_at, client_ua, client_ip),
    ).fetchone()
    return NewRefreshToken(
        id=row[0], token_family_id=family_id,
        raw=raw, expires_at=expires_at,
    )


# ──────────────────────────────────────────────────────────────────────
# Rotate (/refresh)
# ──────────────────────────────────────────────────────────────────────

class RefreshReuseDetected(Exception):
    """Signal для вызывающего: вся family отозвана, ставь 401."""


class RefreshNotFound(Exception):
    """Cookie не соответствует ни одной строке. 401 + clear cookie."""


class RefreshExpired(Exception):
    """TTL вышел. 401 + clear cookie. Family не трогаем — это не reuse."""


def rotate_refresh_token(
    conn: psycopg.Connection,
    raw: str,
    *,
    client_ua: Optional[str] = None,
    client_ip: Optional[str] = None,
) -> tuple[UUID, NewRefreshToken]:
    """Принять raw-токен из cookie, провернуть rotate. Возвращает
    (user_id, NewRefreshToken). На любую аномалию — исключение."""
    token_hash = _hash_token(raw)
    row = conn.execute(
        """
        SELECT id, user_id, token_family_id, expires_at, revoked_at
        FROM user_refresh_token
        WHERE token_hash = %s
        """,
        (token_hash,),
    ).fetchone()
    if row is None:
        raise RefreshNotFound()

    rt_id, user_id, family_id, expires_at, revoked_at = row

    # Reuse detection: любой попадающий сюда revoked токен — сигнал кражи.
    # Отзываем всю family целиком; злоумышленник и жертва оба теряют сессию.
    if revoked_at is not None:
        conn.execute(
            """
            UPDATE user_refresh_token
               SET revoked_at = COALESCE(revoked_at, now()),
                   revoked_reason = COALESCE(revoked_reason, 'reuse_detected')
             WHERE token_family_id = %s
               AND revoked_at IS NULL
            """,
            (family_id,),
        )
        raise RefreshReuseDetected()

    if expires_at <= _now_utc():
        # Мягкая просрочка — family не ломаем.
        raise RefreshExpired()

    # Happy path: revoke старый, insert новый в той же family.
    new_raw = _generate_raw()
    new_hash = _hash_token(new_raw)
    new_expires = _now_utc() + timedelta(seconds=settings.refresh_token_ttl_seconds)

    new_row = conn.execute(
        """
        INSERT INTO user_refresh_token
            (user_id, token_hash, token_family_id, expires_at,
             client_ua, client_ip)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (user_id, new_hash, family_id, new_expires, client_ua, client_ip),
    ).fetchone()
    new_id = new_row[0]

    conn.execute(
        """
        UPDATE user_refresh_token
           SET revoked_at = now(),
               revoked_reason = 'rotated',
               replaced_by_id = %s
         WHERE id = %s
        """,
        (new_id, rt_id),
    )

    return user_id, NewRefreshToken(
        id=new_id, token_family_id=family_id,
        raw=new_raw, expires_at=new_expires,
    )


# ──────────────────────────────────────────────────────────────────────
# Revoke (/logout)
# ──────────────────────────────────────────────────────────────────────

def revoke_refresh_token(conn: psycopg.Connection, raw: str) -> bool:
    """Отозвать конкретный токен по его raw-значению. Возвращает True,
    если что-то отозвано. Идемпотентно: на уже-revoked возвращает False
    без ошибки (/logout должен быть мягким)."""
    token_hash = _hash_token(raw)
    row = conn.execute(
        """
        UPDATE user_refresh_token
           SET revoked_at = now(),
               revoked_reason = 'logout'
         WHERE token_hash = %s
           AND revoked_at IS NULL
        RETURNING id
        """,
        (token_hash,),
    ).fetchone()
    return row is not None
