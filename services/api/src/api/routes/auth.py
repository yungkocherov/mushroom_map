"""Auth-эндпоинты: Yandex OAuth (login/callback), refresh, logout.

Flow со стороны фронта:

    1. Кнопка «Войти через Яндекс» -> браузер идёт на /api/auth/yandex/login.
    2. Backend выставляет короткоживущую state-cookie и 302 -> Yandex.
    3. Yandex возвращает юзера на /api/auth/yandex/callback?code&state.
    4. Backend: validate state, exchange code, upsert user, issue refresh
       cookie, 302 на фронт /auth/complete.
    5. Фронт на /auth/complete делает POST /api/auth/refresh -> получает
       access_token в JSON, хранит в памяти, показывает кабинет.

Access-token живёт 15 мин — фронт периодически дёргает /refresh, это
обновляет refresh-cookie и выдаёт новый access. При logout'е /api/auth/logout
отзывает refresh и чистит cookie.
"""

from __future__ import annotations

import secrets
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse, RedirectResponse

from api.auth import jwt_tokens, refresh as refresh_ops, yandex
from api.auth.users import upsert_oauth_user
from api.db import get_conn
from api.settings import settings


router = APIRouter()


# Cookie с PKCE-verifier'ом — живёт ровно на длительности OAuth-flow.
# Никогда не попадает в URL/state — только сюда. Path сужен до callback'а
# чтобы не светиться на других /api/auth/* эндпоинтах.
PKCE_COOKIE_NAME = "mm_oauth_pkce"
PKCE_COOKIE_PATH = "/api/auth/yandex/callback"
PKCE_COOKIE_MAX_AGE = 600  # 10 мин — синхронно с OAUTH_STATE_TTL_SECONDS


# ──────────────────────────────────────────────────────────────────────
# helpers
# ──────────────────────────────────────────────────────────────────────

def _set_refresh_cookie(resp: Response, raw: str, max_age: int) -> None:
    resp.set_cookie(
        key=refresh_ops.REFRESH_COOKIE_NAME,
        value=raw,
        max_age=max_age,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path=refresh_ops.REFRESH_COOKIE_PATH,
        domain=settings.cookie_domain,
    )


def _clear_refresh_cookie(resp: Response) -> None:
    resp.delete_cookie(
        key=refresh_ops.REFRESH_COOKIE_NAME,
        path=refresh_ops.REFRESH_COOKIE_PATH,
        domain=settings.cookie_domain,
    )


def _set_pkce_cookie(resp: Response, verifier: str) -> None:
    """PKCE verifier хранится тут на время OAuth round-trip. SameSite=Lax
    обязателен — Yandex редиректит обратно top-level GET'ом, нужен
    bypass для cross-site GET. Path сужен до callback пути."""
    resp.set_cookie(
        key=PKCE_COOKIE_NAME,
        value=verifier,
        max_age=PKCE_COOKIE_MAX_AGE,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path=PKCE_COOKIE_PATH,
        domain=settings.cookie_domain,
    )


def _clear_pkce_cookie(resp: Response) -> None:
    resp.delete_cookie(
        key=PKCE_COOKIE_NAME,
        path=PKCE_COOKIE_PATH,
        domain=settings.cookie_domain,
    )


def _client_meta(request: Request) -> tuple[Optional[str], Optional[str]]:
    ua = request.headers.get("user-agent")
    # Если API живёт за Cloudflare/Caddy, real IP будет в X-Forwarded-For.
    # В dev это просто request.client.host.
    fwd = request.headers.get("x-forwarded-for")
    ip = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else None)
    return ua, ip


# ──────────────────────────────────────────────────────────────────────
# Yandex OAuth
# ──────────────────────────────────────────────────────────────────────

@router.get("/yandex/login")
def yandex_login() -> RedirectResponse:
    """Сгенерировать PKCE + state и редиректнуть на oauth.yandex.ru.

    PKCE-verifier хранится в HttpOnly cookie на time-of-flow (10 мин).
    State JWT несёт ТОЛЬКО nonce — он CSRF-binding'ит callback с этой
    конкретной попыткой логина. Раньше verifier ходил внутри state и
    светился в URL/Yandex-логах — это лишало PKCE смысла (RFC 7636 §1:
    verifier не должен покидать клиент пока не дойдёт до /token).
    """
    if not settings.yandex_client_id or not settings.yandex_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Yandex OAuth is not configured on the server",
        )
    verifier = yandex.generate_pkce_verifier()
    challenge = yandex.pkce_challenge(verifier)

    state_jwt = jwt_tokens.encode_oauth_state({
        "nonce": secrets.token_urlsafe(16),
    })
    url = yandex.build_authorize_url(state=state_jwt, code_challenge=challenge)
    resp = RedirectResponse(url=url, status_code=302)
    _set_pkce_cookie(resp, verifier)
    return resp


@router.get("/yandex/callback")
def yandex_callback(request: Request) -> RedirectResponse:
    """Обработать редирект с Yandex: code + state -> userinfo -> user + refresh.

    На любую ошибку редиректим на frontend_auth_error_url с query `?reason=…`,
    чтобы фронт показал понятное сообщение. Не кидаем 500/400 в браузер
    напрямую — это был бы тупик для юзера.
    """
    qp = request.query_params
    code = qp.get("code")
    state = qp.get("state")
    error = qp.get("error")

    if error:
        return RedirectResponse(
            url=f"{settings.frontend_auth_error_url}?reason={error}",
            status_code=302,
        )
    if not code or not state:
        return RedirectResponse(
            url=f"{settings.frontend_auth_error_url}?reason=missing_params",
            status_code=302,
        )

    try:
        # State JWT валидируется, но дальше нужен только сам факт что он
        # наш и не просрочен (CSRF binding к /login сессии).
        jwt_tokens.decode_oauth_state(state)
    except jwt_tokens.OAuthStateInvalid:
        resp = RedirectResponse(
            url=f"{settings.frontend_auth_error_url}?reason=bad_state",
            status_code=302,
        )
        _clear_pkce_cookie(resp)
        return resp

    verifier = request.cookies.get(PKCE_COOKIE_NAME)
    if not verifier:
        # Cookie не пришла — возможно, юзер пришёл из истории браузера
        # без свежего /login, или прошёл TTL. Просим начать заново.
        return RedirectResponse(
            url=f"{settings.frontend_auth_error_url}?reason=missing_pkce",
            status_code=302,
        )

    try:
        token_resp = yandex.exchange_code(code, verifier)
        yuser = yandex.fetch_userinfo(token_resp.access_token)
    except yandex.YandexOAuthError:
        resp = RedirectResponse(
            url=f"{settings.frontend_auth_error_url}?reason=provider_error",
            status_code=302,
        )
        _clear_pkce_cookie(resp)
        return resp

    ua, ip = _client_meta(request)
    with get_conn() as conn:
        user = upsert_oauth_user(
            conn,
            auth_provider="yandex",
            provider_subject=yuser.subject,
            email=yuser.email,
            email_verified=yuser.email_verified,
            display_name=yuser.display_name,
            avatar_url=yuser.avatar_url,
            locale=None,
        )
        new_rt = refresh_ops.issue_refresh_token(
            conn, user.id, client_ua=ua, client_ip=ip,
        )
        conn.commit()

    # Успех: выставляем refresh, чистим использованную PKCE cookie
    # (одноразовая по контракту flow).
    redirect = RedirectResponse(url=settings.frontend_auth_complete_url, status_code=302)
    _set_refresh_cookie(redirect, new_rt.raw, settings.refresh_token_ttl_seconds)
    _clear_pkce_cookie(redirect)
    return redirect


# ──────────────────────────────────────────────────────────────────────
# Refresh
# ──────────────────────────────────────────────────────────────────────

@router.post("/refresh")
def refresh(request: Request) -> Response:
    """Rotate refresh-cookie -> вернуть новый access_token в JSON.

    Ответ: {access_token: "...", token_type: "Bearer", expires_in: 900}.
    """
    raw = request.cookies.get(refresh_ops.REFRESH_COOKIE_NAME)
    if not raw:
        # Нет cookie — фронт не залогинен. Это нормальный код, не ошибка.
        raise HTTPException(status_code=401, detail="no refresh cookie")

    ua, ip = _client_meta(request)
    try:
        with get_conn() as conn:
            user_id, new_rt = refresh_ops.rotate_refresh_token(
                conn, raw, client_ua=ua, client_ip=ip,
            )
            conn.commit()
    except refresh_ops.RefreshReuseDetected:
        resp = JSONResponse({"detail": "refresh token reuse detected"}, status_code=401)
        _clear_refresh_cookie(resp)
        return resp
    except refresh_ops.RefreshNotFound:
        resp = JSONResponse({"detail": "unknown refresh token"}, status_code=401)
        _clear_refresh_cookie(resp)
        return resp
    except refresh_ops.RefreshExpired:
        resp = JSONResponse({"detail": "refresh token expired"}, status_code=401)
        _clear_refresh_cookie(resp)
        return resp

    access_token, expires_in = jwt_tokens.encode_access_token(user_id)
    resp = JSONResponse({
        "access_token": access_token,
        "token_type": "Bearer",
        "expires_in": expires_in,
    })
    _set_refresh_cookie(resp, new_rt.raw, settings.refresh_token_ttl_seconds)
    return resp


# ──────────────────────────────────────────────────────────────────────
# Logout
# ──────────────────────────────────────────────────────────────────────

@router.post("/logout")
def logout(request: Request) -> Response:
    """Отозвать refresh-токен (если есть) и очистить cookie. 204 No Content."""
    raw = request.cookies.get(refresh_ops.REFRESH_COOKIE_NAME)
    if raw:
        with get_conn() as conn:
            refresh_ops.revoke_refresh_token(conn, raw)
            conn.commit()
    resp = Response(status_code=204)
    _clear_refresh_cookie(resp)
    return resp
