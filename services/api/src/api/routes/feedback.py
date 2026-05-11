"""User feedback endpoint.

    POST /api/feedback
        Принимает обратную связь от любого посетителя сайта
        (auth не требуется). Сохраняет в `user_feedback` (миграция 041).

Юзер пишет короткое сообщение через FloatingFeedbackButton в правом
нижнем углу. Опционально оставляет контакт (email/tg/что хочет).

После успешного INSERT'а — best-effort Telegram-нотификация автору
через `api.telegram.org/bot<token>/sendMessage` (`settings.tg_bot_token`
+ `tg_chat_id`). Изначально планировалось через SMTP/email, но TimeWeb
режет outbound 25/465/587 (стандартная anti-spam политика бюджетных
хостеров). HTTPS на 443 проходит свободно.

Если оба TG-поля заданы — fire-and-forget POST в отдельном thread'е,
не блокируя HTTP-ответ юзеру. Пустые значения = silent skip; фидбек в
БД сохраняется в любом случае.

Anti-spam — пока примитивно: rate-limit 5 сообщений в час с одного IP,
+ длина message ∈ [3, 4000]. Если фидбек массово польётся — добавим
hCaptcha. Сейчас сайт получает ~0 спама, поэтому overengineering.
"""

from __future__ import annotations

import logging
import socket
import threading
import time
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from api.auth.jwt_tokens import AccessTokenInvalid, decode_access_token
from api.db import get_conn
from api.rate_limit import limiter
from api.settings import settings

log = logging.getLogger("api.feedback")

# V4.10: monkey-patch `socket.getaddrinfo` один раз на module-load
# (вместо per-worker patch с try/finally — там был race при concurrent
# фидбэках). Фильтр **только для api.telegram.org**: остальные resolve'ы
# (Sentry, Yandex OAuth, и т.д.) идут через native dual-stack.
# Docker bridge на TimeWeb не маршрутизирует IPv6 → AAAA-резолв падал.
_orig_getaddrinfo = socket.getaddrinfo


def _ipv4_only_for_telegram(host, *args, **kwargs):
    results = _orig_getaddrinfo(host, *args, **kwargs)
    if host and "telegram.org" in str(host).lower():
        v4_only = [r for r in results if r[0] == socket.AF_INET]
        return v4_only or results
    return results


socket.getaddrinfo = _ipv4_only_for_telegram  # type: ignore[assignment]

router = APIRouter()


class FeedbackPayload(BaseModel):
    message: str = Field(min_length=3, max_length=4000)
    contact: Optional[str] = Field(default=None, max_length=200)
    page_url: Optional[str] = Field(default=None, max_length=1000)


def _maybe_user_id(request: Request) -> Optional[str]:
    """Тихо парсим Authorization, если есть. Не падаем — фидбэк работает
    и для анонимов."""
    auth = request.headers.get("authorization")
    if not auth or not auth.lower().startswith("bearer "):
        return None
    token = auth.split(" ", 1)[1].strip()
    try:
        return decode_access_token(token)
    except AccessTokenInvalid:
        return None


def _notify_telegram_async(
    feedback_id: int,
    message: str,
    contact: Optional[str],
    page_url: Optional[str],
    user_agent: Optional[str],
    user_id: Optional[str],
) -> None:
    """POST'ит сообщение в Telegram через bot API в отдельном thread'е,
    не блокируя HTTP-ответ юзеру. Если bot_token/chat_id пусты или
    запрос упал — лог-warn, запись в БД остаётся (source-of-truth).

    Используем plain text (parse_mode=None) — внутри сообщения есть
    user-controlled текст с произвольным markdown'ом, который ломал бы
    рендер при parse_mode=Markdown. Длинные UA обрезаем."""
    if not (settings.tg_bot_token and settings.tg_chat_id):
        return  # TG не настроен — silent skip

    text = (
        f"geobiom feedback #{feedback_id}\n"
        f"\n"
        f"{message}\n"
        f"\n"
        f"---\n"
        f"Контакт:  {contact or '-'}\n"
        f"Страница: {page_url or '-'}\n"
        f"UA:       {(user_agent or '-')[:120]}\n"
        f"User:     {user_id or 'anon'}"
    )

    def worker() -> None:
        # V4.10: monkey-patch теперь на module-level (см. выше), worker
        # просто использует httpx без обёрток. Убрали try/finally restore
        # — он создавал race при двух concurrent фидбэках одновременно.
        last_err: Exception | None = None
        for attempt in range(3):
            try:
                r = httpx.post(
                    f"https://api.telegram.org/bot{settings.tg_bot_token}/sendMessage",
                    json={
                        "chat_id": settings.tg_chat_id,
                        "text": text,
                        "disable_web_page_preview": True,
                    },
                    timeout=15,
                )
                r.raise_for_status()
                log.warning(
                    "feedback #%s posted to telegram (attempt %d)",
                    feedback_id, attempt + 1,
                )
                return
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                if attempt < 2:
                    time.sleep(1 + 2 * attempt)  # 1s → 3s
        log.exception(
            "feedback #%s telegram-send failed after 3 attempts: %r",
            feedback_id, last_err,
        )

    threading.Thread(target=worker, daemon=True).start()


@router.post("", status_code=status.HTTP_201_CREATED)
@limiter.limit("50/hour")  # V4.10: было 5/hour — слишком строго для
                            # ручного тестирования автором. 50/hour
                            # покрывает живых юзеров + автор-тесты.
def submit_feedback(payload: FeedbackPayload, request: Request) -> dict:
    user_id = _maybe_user_id(request)
    user_agent = request.headers.get("user-agent", "")[:500] or None
    contact = payload.contact.strip() if payload.contact else None
    page_url = payload.page_url.strip() if payload.page_url else None
    message = payload.message.strip()

    try:
        with get_conn() as conn:
            row = conn.execute(
                """
                INSERT INTO user_feedback
                    (user_id, message, contact, page_url, user_agent)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
                """,
                (user_id, message, contact, page_url, user_agent),
            ).fetchone()
            conn.commit()
    except Exception as exc:  # noqa: BLE001
        # Намеренно широко — не хочется выпасть 500'кой в браузер юзера
        # из-за временного pool-issue. Логируется через uvicorn.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="feedback temporarily unavailable",
        ) from exc

    feedback_id = int(row[0])
    _notify_telegram_async(
        feedback_id=feedback_id,
        message=message,
        contact=contact,
        page_url=page_url,
        user_agent=user_agent,
        user_id=user_id,
    )
    return {"id": feedback_id}
