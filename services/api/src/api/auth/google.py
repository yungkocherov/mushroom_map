"""Google Sign-In (OIDC) client.

Endpoints:
    authorize:  https://accounts.google.com/o/oauth2/v2/auth
    token:      https://oauth2.googleapis.com/token
    userinfo:   https://openidconnect.googleapis.com/v1/userinfo

Mobile-flow (Android, тип клиента «Android» в Google Cloud Console):
    - client_secret НЕ выдаётся для Android-типа; mobile.py шлёт только
      client_id + PKCE verifier. Google это разрешает (RFC 8252 / IETF
      OAuth 2.0 для нативных приложений).
    - redirect_uri — custom scheme `geobiom://auth/callback` (тот же
      что и для Yandex'а; Google разрешает любой scheme в Android-клиенте).

Для типа «Web» — secret нужен, тогда передаём `google_mobile_client_secret`
(если задан в settings; пусто = клиент Android-типа).

Scope: `openid email profile` — стандартный набор для получения email +
имени. Без `offline_access` — нам не нужен refresh; userinfo дёргается
один раз для записи в `oauth_user`, дальше работаем со своим device_token.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import httpx

from api.settings import settings


TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"

SCOPE = "openid email profile"


class GoogleOAuthError(Exception):
    """Любой сбой при общении с Google-OAuth/OIDC."""


@dataclass
class GoogleTokenResponse:
    access_token: str
    token_type: str
    expires_in: int
    id_token: Optional[str] = None


def exchange_code_mobile(
    code: str, code_verifier: str, redirect_uri: str
) -> GoogleTokenResponse:
    """Authorization code → access_token. Использует
    `google_mobile_client_id` (+ optional secret) из settings."""
    if not settings.google_mobile_client_id:
        raise GoogleOAuthError(
            "google_mobile_client_id not configured — "
            "register an OAuth 2.0 client at console.cloud.google.com"
        )
    data: dict[str, str] = {
        "grant_type": "authorization_code",
        "code": code,
        "code_verifier": code_verifier,
        "client_id": settings.google_mobile_client_id,
        "redirect_uri": redirect_uri,
    }
    if settings.google_mobile_client_secret:
        data["client_secret"] = settings.google_mobile_client_secret

    try:
        resp = httpx.post(TOKEN_URL, data=data, timeout=10.0)
    except httpx.HTTPError as exc:
        raise GoogleOAuthError(f"token request failed: {exc}") from exc
    if resp.status_code != 200:
        raise GoogleOAuthError(
            f"token endpoint returned {resp.status_code}: {resp.text[:200]}"
        )
    body = resp.json()
    try:
        return GoogleTokenResponse(
            access_token=body["access_token"],
            token_type=body.get("token_type", "Bearer"),
            expires_in=int(body.get("expires_in", 0)),
            id_token=body.get("id_token"),
        )
    except (KeyError, ValueError) as exc:
        raise GoogleOAuthError(f"malformed token response: {body}") from exc


@dataclass
class GoogleUser:
    subject: str           # stable id (sub в OIDC)
    email: Optional[str]
    email_verified: bool
    display_name: Optional[str]
    avatar_url: Optional[str]


def fetch_userinfo(access_token: str) -> GoogleUser:
    try:
        resp = httpx.get(
            USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10.0,
        )
    except httpx.HTTPError as exc:
        raise GoogleOAuthError(f"userinfo request failed: {exc}") from exc
    if resp.status_code != 200:
        raise GoogleOAuthError(
            f"userinfo returned {resp.status_code}: {resp.text[:200]}"
        )
    body = resp.json()

    subject = str(body.get("sub") or "")
    if not subject:
        raise GoogleOAuthError(f"userinfo without sub: {body}")

    return GoogleUser(
        subject=subject,
        email=body.get("email"),
        email_verified=bool(body.get("email_verified")),
        display_name=body.get("name") or body.get("given_name"),
        avatar_url=body.get("picture"),
    )
