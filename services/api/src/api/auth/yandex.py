"""Yandex ID OAuth 2.0 client.

Endpoints (docs: https://yandex.ru/dev/id/doc/ru/):
    authorize:  https://oauth.yandex.ru/authorize
    token:      https://oauth.yandex.ru/token
    userinfo:   https://login.yandex.ru/info?format=json

Используется Authorization Code flow + PKCE (S256). Client secret всё
равно передаётся (confidential client), PKCE — defense-in-depth против
кражи authorization code из истории браузера / прокси-логов.
"""

from __future__ import annotations

import base64
import hashlib
import secrets
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlencode

import httpx

from api.settings import settings


AUTHORIZE_URL = "https://oauth.yandex.ru/authorize"
TOKEN_URL = "https://oauth.yandex.ru/token"
USERINFO_URL = "https://login.yandex.ru/info"

# login:email  — default_email и emails[]
# login:info   — id (sub), display_name, real_name, login
# login:avatar — default_avatar_id
SCOPE = "login:email login:info login:avatar"


# ──────────────────────────────────────────────────────────────────────
# PKCE helpers
# ──────────────────────────────────────────────────────────────────────

def generate_pkce_verifier() -> str:
    """43+-символов base64url, как требует RFC 7636 §4.1."""
    return secrets.token_urlsafe(64)


def pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


# ──────────────────────────────────────────────────────────────────────
# Authorize URL
# ──────────────────────────────────────────────────────────────────────

def build_authorize_url(*, state: str, code_challenge: str) -> str:
    params = {
        "response_type": "code",
        "client_id": settings.yandex_client_id,
        "redirect_uri": settings.yandex_redirect_uri,
        "scope": SCOPE,
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


# ──────────────────────────────────────────────────────────────────────
# Code exchange
# ──────────────────────────────────────────────────────────────────────

class YandexOAuthError(Exception):
    """Любой сбой при общении с Yandex-OAuth."""


@dataclass
class YandexTokenResponse:
    access_token: str
    token_type: str
    expires_in: int


def exchange_code(code: str, code_verifier: str) -> YandexTokenResponse:
    """Authorization code -> access_token. Refresh-токен Yandex'а нам
    не нужен: мы держим свою refresh-инфраструктуру, а Yandex access
    достаточно одного вызова для получения userinfo."""
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "code_verifier": code_verifier,
        "client_id": settings.yandex_client_id,
        "client_secret": settings.yandex_client_secret,
        "redirect_uri": settings.yandex_redirect_uri,
    }
    return _post_token_exchange(data)


def exchange_code_mobile(
    code: str, code_verifier: str, redirect_uri: str
) -> YandexTokenResponse:
    """Mobile-вариант обмена. Использует ОТДЕЛЬНОЕ Yandex-приложение
    (тип «Мобильное») с собственным client_id/secret и redirect_uri
    `geobiom://auth/callback`. Backend хранит client_secret —
    в APK его не кладём по OAuth Mobile BCP."""
    if not settings.yandex_mobile_client_id or not settings.yandex_mobile_client_secret:
        raise YandexOAuthError(
            "yandex_mobile_client_id / secret not configured — "
            "register a 'Mobile' app at oauth.yandex.ru and set env vars"
        )
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "code_verifier": code_verifier,
        "client_id": settings.yandex_mobile_client_id,
        "client_secret": settings.yandex_mobile_client_secret,
        "redirect_uri": redirect_uri,
    }
    return _post_token_exchange(data)


def _post_token_exchange(data: dict[str, str]) -> YandexTokenResponse:
    try:
        resp = httpx.post(TOKEN_URL, data=data, timeout=10.0)
    except httpx.HTTPError as exc:
        raise YandexOAuthError(f"token request failed: {exc}") from exc
    if resp.status_code != 200:
        raise YandexOAuthError(
            f"token endpoint returned {resp.status_code}: {resp.text[:200]}"
        )
    body = resp.json()
    try:
        return YandexTokenResponse(
            access_token=body["access_token"],
            token_type=body.get("token_type", "bearer"),
            expires_in=int(body.get("expires_in", 0)),
        )
    except (KeyError, ValueError) as exc:
        raise YandexOAuthError(f"malformed token response: {body}") from exc


# ──────────────────────────────────────────────────────────────────────
# Userinfo
# ──────────────────────────────────────────────────────────────────────

@dataclass
class YandexUser:
    subject: str           # stable id у Yandex (поле "id")
    email: Optional[str]
    email_verified: bool
    display_name: Optional[str]
    avatar_url: Optional[str]


def fetch_userinfo(access_token: str) -> YandexUser:
    try:
        resp = httpx.get(
            USERINFO_URL,
            params={"format": "json"},
            headers={"Authorization": f"OAuth {access_token}"},
            timeout=10.0,
        )
    except httpx.HTTPError as exc:
        raise YandexOAuthError(f"userinfo request failed: {exc}") from exc
    if resp.status_code != 200:
        raise YandexOAuthError(
            f"userinfo returned {resp.status_code}: {resp.text[:200]}"
        )
    body = resp.json()

    subject = str(body.get("id") or "")
    if not subject:
        raise YandexOAuthError(f"userinfo without id: {body}")

    # default_email — приоритетный; Yandex отдаёт его только если scope
    # включает login:email И юзер не снял галочку на шаге подтверждения.
    email = body.get("default_email")
    # Yandex верифицирует все выставленные email'ы сам.
    email_verified = bool(email)

    display_name = body.get("display_name") or body.get("real_name") or body.get("login")

    avatar_id = body.get("default_avatar_id")
    avatar_url: Optional[str] = None
    if avatar_id and not body.get("is_avatar_empty"):
        # Схема URL на avatars.yandex.net задокументирована в Yandex ID docs.
        avatar_url = f"https://avatars.yandex.net/get-yapic/{avatar_id}/islands-200"

    return YandexUser(
        subject=subject,
        email=email,
        email_verified=email_verified,
        display_name=display_name,
        avatar_url=avatar_url,
    )
