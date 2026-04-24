"""Upsert / lookup helpers для таблицы users."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from uuid import UUID

import psycopg


@dataclass
class User:
    id: UUID
    auth_provider: str
    provider_subject: str
    email: Optional[str]
    email_verified: bool
    display_name: Optional[str]
    avatar_url: Optional[str]
    locale: Optional[str]
    status: str
    created_at: datetime
    last_login_at: Optional[datetime]


def _row_to_user(row: tuple) -> User:
    return User(
        id=row[0], auth_provider=row[1], provider_subject=row[2],
        email=row[3], email_verified=row[4], display_name=row[5],
        avatar_url=row[6], locale=row[7], status=row[8],
        created_at=row[9], last_login_at=row[10],
    )


_SELECT = """
    SELECT id, auth_provider, provider_subject,
           email, email_verified, display_name, avatar_url, locale,
           status, created_at, last_login_at
"""


def get_user_by_id(conn: psycopg.Connection, user_id: UUID) -> Optional[User]:
    row = conn.execute(
        f"{_SELECT} FROM users WHERE id = %s",
        (user_id,),
    ).fetchone()
    return _row_to_user(row) if row else None


def upsert_oauth_user(
    conn: psycopg.Connection,
    *,
    auth_provider: str,
    provider_subject: str,
    email: Optional[str],
    email_verified: bool,
    display_name: Optional[str],
    avatar_url: Optional[str],
    locale: Optional[str],
) -> User:
    """Найти юзера по (provider, subject); если нет — создать. Обновить
    last_login_at и профиль (эти поля обновляются при каждом логине, чтобы
    сайт показывал актуальный display_name/avatar с провайдера)."""
    row = conn.execute(
        f"""
        INSERT INTO users
            (auth_provider, provider_subject,
             email, email_verified, display_name, avatar_url, locale,
             last_login_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, now())
        ON CONFLICT (auth_provider, provider_subject) DO UPDATE SET
            email          = EXCLUDED.email,
            email_verified = EXCLUDED.email_verified,
            display_name   = EXCLUDED.display_name,
            avatar_url     = EXCLUDED.avatar_url,
            locale         = COALESCE(EXCLUDED.locale, users.locale),
            last_login_at  = now(),
            updated_at     = now()
        RETURNING id, auth_provider, provider_subject,
                  email, email_verified, display_name, avatar_url, locale,
                  status, created_at, last_login_at
        """,
        (auth_provider, provider_subject, email, email_verified,
         display_name, avatar_url, locale),
    ).fetchone()
    return _row_to_user(row)
