"""Юзер-эндпоинты для уже залогиненного клиента."""

from __future__ import annotations

from fastapi import APIRouter

from api.auth.dependencies import CurrentUser


router = APIRouter()


@router.get("/me")
def me(user: CurrentUser) -> dict:
    """Профиль текущего юзера. Используется фронтом для hydrate'а сессии
    и для отображения avatar/display_name в header'е."""
    return {
        "id": str(user.id),
        "auth_provider": user.auth_provider,
        "email": user.email,
        "email_verified": user.email_verified,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
        "locale": user.locale,
        "status": user.status,
        "created_at": user.created_at.isoformat(),
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
    }
