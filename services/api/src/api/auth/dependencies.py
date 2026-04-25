"""FastAPI dependencies: `CurrentUser` для защищённых эндпоинтов.

Использование:

    from api.auth.dependencies import CurrentUser

    @router.get("/me")
    def me(user: CurrentUser) -> dict:
        return {"id": str(user.id), "email": user.email}

401 автоматически, если access-JWT отсутствует / не валиден / юзер
забанен или удалён.
"""

from __future__ import annotations

from typing import Annotated

import psycopg
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from api.auth.jwt_tokens import AccessTokenInvalid, decode_access_token
from api.auth.users import User, get_user_by_id
from api.db import get_conn


# auto_error=False — мы сами превращаем «нет Authorization» в наш 401
# с понятным JSON. Иначе FastAPI отдаст стандартный 403 HTTPBearer.
_bearer = HTTPBearer(auto_error=False)


def _credentials_error(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    request: Request,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if creds is None or creds.scheme.lower() != "bearer":
        raise _credentials_error("missing bearer token")
    try:
        user_id = decode_access_token(creds.credentials)
    except AccessTokenInvalid as exc:
        raise _credentials_error(f"invalid access token: {exc}") from exc

    # Если пул исчерпан / БД упала — это 503, а не 401. Иначе фронт
    # увидит «invalid access token» / «missing bearer token» и
    # AuthProvider молча разлогинит юзера (CLAUDE.md гача про
    # «CORS-ошибка как 500»).
    try:
        with get_conn() as conn:
            user = get_user_by_id(conn, user_id)
    except psycopg.Error as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="database temporarily unavailable",
        ) from exc

    if user is None:
        raise _credentials_error("user no longer exists")
    if user.status != "active":
        raise _credentials_error(f"user status: {user.status}")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
