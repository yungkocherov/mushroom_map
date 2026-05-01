"""JWT helpers.

Здесь живут две разные формы JWT:

1. **Access-token** (`encode_access_token` / `decode_access_token`) — 15 мин,
   HS256, клеймы {sub=user_id, iss, iat, exp, typ="access"}. Фронт
   хранит в памяти, шлёт как `Authorization: Bearer …`.

2. **OAuth-state-token** (`encode_oauth_state` / `decode_oauth_state`) —
   10 мин, HS256, кладёт `{nonce, pkce_verifier, return_to}`. Нужен чтобы
   выжить round-trip Yandex-авторизации: callback должен верифицировать
   что state именно мы выдали (CSRF) + получить обратно PKCE-verifier.

Мы намеренно не используем OIDC-libs/Authlib — это +1 зависимость и
+1 слой абстракции ради 30 строк кода. PyJWT покрывает 100% наших
потребностей.
"""

from __future__ import annotations

import time
from typing import Any
from uuid import UUID

import jwt

from api.settings import settings


_ALGO = "HS256"


# ──────────────────────────────────────────────────────────────────────
# Access tokens
# ──────────────────────────────────────────────────────────────────────

def encode_access_token(user_id: UUID) -> tuple[str, int]:
    """Вернуть (token, expires_in_seconds). TTL берётся из settings."""
    now = int(time.time())
    exp = now + settings.access_token_ttl_seconds
    payload = {
        "iss": settings.jwt_issuer,
        "sub": str(user_id),
        "iat": now,
        "exp": exp,
        "typ": "access",
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=_ALGO)
    return token, settings.access_token_ttl_seconds


class AccessTokenInvalid(Exception):
    """Raised когда access-JWT подделан / просрочен / не того типа."""


def decode_access_token(token: str) -> UUID:
    """Вернуть user_id из валидного access-JWT, иначе AccessTokenInvalid."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[_ALGO],
            issuer=settings.jwt_issuer,
            options={"require": ["sub", "exp", "iat", "iss"]},
        )
    except jwt.InvalidTokenError as exc:
        raise AccessTokenInvalid(str(exc)) from exc
    typ = payload.get("typ")
    # `device` принимается тоже — long-lived mobile token используется
    # как Bearer везде где access. Различие только в TTL и происхождении.
    if typ not in {"access", "device"}:
        raise AccessTokenInvalid("wrong token type")
    try:
        return UUID(payload["sub"])
    except (ValueError, KeyError) as exc:
        raise AccessTokenInvalid("sub is not a uuid") from exc


# ──────────────────────────────────────────────────────────────────────
# Device tokens (mobile)
# ──────────────────────────────────────────────────────────────────────

def encode_device_token(user_id: UUID, device_id: str) -> tuple[str, int]:
    """Long-lived JWT для mobile-app. TTL ~год; используется как Bearer
    в `/api/mobile/*` и `/api/cabinet/*`.

    Хранит `device_id` в payload — при добавлении revocation таблицы
    (Phase 2 spec) blacklist matche'ится по (user_id, device_id) tuple,
    а не по jti.
    """
    now = int(time.time())
    exp = now + settings.device_token_ttl_seconds
    payload = {
        "iss": settings.jwt_issuer,
        "sub": str(user_id),
        "iat": now,
        "exp": exp,
        "typ": "device",
        "did": device_id,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=_ALGO)
    return token, settings.device_token_ttl_seconds


# ──────────────────────────────────────────────────────────────────────
# OAuth state tokens (Yandex /authorize round-trip)
# ──────────────────────────────────────────────────────────────────────

OAUTH_STATE_TTL_SECONDS = 10 * 60  # 10 минут хватит на любого юзера


def encode_oauth_state(payload: dict[str, Any]) -> str:
    """Подписать dict HMAC'ом как короткоживущий JWT.

    Используется для CSRF-state и переноса PKCE-verifier через редирект
    к Yandex. Это НЕ access-token; клеймы typ="oauth_state", чтобы
    нельзя было подсунуть access-JWT как state и наоборот.
    """
    now = int(time.time())
    jwt_payload = {
        **payload,
        "iss": settings.jwt_issuer,
        "iat": now,
        "exp": now + OAUTH_STATE_TTL_SECONDS,
        "typ": "oauth_state",
    }
    return jwt.encode(jwt_payload, settings.jwt_secret, algorithm=_ALGO)


class OAuthStateInvalid(Exception):
    """Raised когда state-JWT подделан / просрочен / не того типа."""


def decode_oauth_state(token: str) -> dict[str, Any]:
    """Вернуть полный payload state-JWT, иначе OAuthStateInvalid."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[_ALGO],
            issuer=settings.jwt_issuer,
            options={"require": ["exp", "iat", "iss"]},
        )
    except jwt.InvalidTokenError as exc:
        raise OAuthStateInvalid(str(exc)) from exc
    if payload.get("typ") != "oauth_state":
        raise OAuthStateInvalid("wrong token type")
    return payload
