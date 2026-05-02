"""Per-route rate limiting via slowapi.

Активируется через `settings.rate_limit_enabled` (по умолчанию OFF).
В dev/CI выключен — иначе integration-тесты ловят 429 на 10 рефрешах
подряд из одного IP. В проде включается через `RATE_LIMIT_ENABLED=true`
в .env.prod (вместе с `cookie_secure=true`).

Использование в роутах:

    from api.rate_limit import limiter

    @router.post("/refresh")
    @limiter.limit("5/minute")
    def refresh(request: Request) -> Response:
        ...

`request: Request` параметр обязателен — slowapi экстрактит из него
client IP через `key_func=get_remote_address`. Все наши auth-handlers
уже принимают `Request`, кроме `yandex_login` — туда параметр был
добавлен в этом же PR.

Когда rate_limit_enabled=False, `limiter` — заглушка с no-op `.limit(...)`
декоратором. Импорт slowapi/redis в этом случае не выполняется — пакет
не нужен в dev-образе.
"""

from __future__ import annotations

from typing import Any, Callable, TypeVar

from api.settings import settings


F = TypeVar("F", bound=Callable[..., Any])


class _NoLimiter:
    """Stub-Limiter: `.limit(...)` возвращает identity-декоратор."""

    def limit(self, *args: Any, **kwargs: Any) -> Callable[[F], F]:
        def decorator(fn: F) -> F:
            return fn
        return decorator


if settings.rate_limit_enabled:
    # Импорт отложенный: пакет slowapi нужен только в проде.
    from slowapi import Limiter  # type: ignore[import-not-found]
    from slowapi.util import get_remote_address  # type: ignore[import-not-found]

    limiter: Any = Limiter(key_func=get_remote_address, default_limits=[])
else:
    limiter = _NoLimiter()
