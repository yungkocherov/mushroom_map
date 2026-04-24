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

    State с зашитым PKCE-verifier'ом мы передаём как query-параметр
    `state` *самой Yandex'е* — она вернёт его обратно в callback. Так
    мы избегаем cookie (меньше cookie-поверхности) и заодно получаем
    проверку CSRF (state подписан нашим jwt_secret)."""
    if not settings.yandex_client_id or not settings.yandex_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Yandex OAuth is not configured on the server",
        )
    verifier = yandex.generate_pkce_verifier()
    challenge = yandex.pkce_challenge(verifier)

    # state включает nonce — чтобы один и тот же authorize-URL нельзя
    # было переиспользовать и чтобы JWT не был детерминированным.
    state_jwt = jwt_tokens.encode_oauth_state({
        "nonce": secrets.token_urlsafe(16),
        "pkce_verifier": verifier,
    })
    url = yandex.build_authorize_url(state=state_jwt, code_challenge=challenge)
    return RedirectResponse(url=url, status_code=302)


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
        state_payload = jwt_tokens.decode_oauth_state(state)
        verifier = state_payload.get("pkce_verifier")
        if not verifier:
            raise jwt_tokens.OAuthStateInvalid("no pkce_verifier in state")
    except jwt_tokens.OAuthStateInvalid:
        return RedirectResponse(
            url=f"{settings.frontend_auth_error_url}?reason=bad_state",
            status_code=302,
        )

    try:
        token_resp = yandex.exchange_code(code, verifier)
        yuser = yandex.fetch_userinfo(token_resp.access_token)
    except yandex.YandexOAuthError:
        return RedirectResponse(
            url=f"{settings.frontend_auth_error_url}?reason=provider_error",
            status_code=302,
        )

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

    # Редирект с выставленной HttpOnly cookie. RedirectResponse в Starlette
    # поддерживает set_cookie через headers, но проще сконструировать вручную.
    redirect = RedirectResponse(url=settings.frontend_auth_complete_url, status_code=302)
    _set_refresh_cookie(redirect, new_rt.raw, settings.refresh_token_ttl_seconds)
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
