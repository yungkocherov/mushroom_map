"""Настройки API сервиса."""

import os
import sys

from pydantic_settings import BaseSettings, SettingsConfigDict


# Маркер default'а для JWT_SECRET. Любое prod-окружение должно
# переопределить, иначе сессии форжатся public-known секретом.
_JWT_SECRET_DEFAULT = "change-me-in-production-a-long-random-string"


class Settings(BaseSettings):
    database_url: str = "postgresql://mushroom:mushroom_dev@localhost:5432/mushroom_map"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    api_cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    tiles_dir: str = "/tiles"
    terrain_dir: str = "/terrain"

    # ── Auth / JWT ────────────────────────────────────────────────────
    # jwt_secret — HS256, используется и для access-JWT, и для подписи
    # короткоживущих OAuth-state/PKCE-cookies. В .env.example указан
    # placeholder; в dev'е достаточно любой случайной строки.
    jwt_secret: str = _JWT_SECRET_DEFAULT
    jwt_issuer: str = "mushroom-map"
    # Access-token живёт 15 минут — фронт хранит в памяти, передаёт как
    # Authorization: Bearer. Refresh (30 дней) — в HttpOnly cookie, в БД
    # только SHA-256 хэш (см. 027_user_refresh_token).
    access_token_ttl_seconds: int = 15 * 60
    refresh_token_ttl_seconds: int = 30 * 24 * 3600

    # Cookie-настройки. В dev cookie_secure=False (http://localhost).
    # В проде — TRUE (Cloudflare выдаёт HTTPS автоматически).
    cookie_secure: bool = False
    cookie_domain: str | None = None  # None = host-only (рекомендовано)

    # ── Yandex ID OAuth ──────────────────────────────────────────────
    # Регистрация: https://oauth.yandex.ru/client/new
    # Scopes: login:email login:info login:avatar
    # Callback: {api}/api/auth/yandex/callback
    yandex_client_id: str = ""
    yandex_client_secret: str = ""
    yandex_redirect_uri: str = "http://localhost:8000/api/auth/yandex/callback"

    # Куда callback редиректит фронт после выдачи refresh-cookie.
    # Фронт по /auth/complete дёргает POST /api/auth/refresh и получает
    # access_token в JSON.
    frontend_auth_complete_url: str = "http://localhost:5173/auth/complete"
    # Fallback при ошибке OAuth (user denied / state mismatch / ...).
    frontend_auth_error_url: str = "http://localhost:5173/auth/error"

    # ── Observability (GlitchTip / Sentry-compatible) ─────────────────
    # sentry_dsn пустой = SDK не инициализируется (no-op). Это безопасный
    # дефолт — код может ехать в проде до того как поднят GlitchTip.
    # git_sha используется как release-тег для группировки событий по
    # коммиту; задаётся через GIT_SHA env в deploy-api workflow.
    sentry_dsn: str = ""
    sentry_environment: str = "production"
    sentry_traces_sample_rate: float = 0.1
    git_sha: str = "unknown"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.api_cors_origins.split(",") if o.strip()]


settings = Settings()


# Hard fail в проде если JWT_SECRET не переопределён. ENV=prod
# (или COOKIE_SECURE=true) — индикатор. Для dev/test — warn-only.
def _validate_secret() -> None:
    is_default = settings.jwt_secret == _JWT_SECRET_DEFAULT
    if not is_default:
        return
    looks_like_prod = (
        settings.cookie_secure
        or os.environ.get("ENV", "").lower() in {"prod", "production"}
    )
    if looks_like_prod:
        sys.stderr.write(
            "FATAL: JWT_SECRET is the default value but environment looks "
            "like production (cookie_secure=True or ENV=prod). Forge any "
            "session for any user. Set JWT_SECRET to a long random string "
            "(see infra/.env.prod.example).\n"
        )
        raise SystemExit(2)
    sys.stderr.write(
        "WARNING: JWT_SECRET uses the public default. OK for dev; NEVER "
        "ship to production.\n"
    )


_validate_secret()
