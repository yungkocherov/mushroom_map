"""User feedback endpoint.

    POST /api/feedback
        Принимает обратную связь от любого посетителя сайта
        (auth не требуется). Сохраняет в `user_feedback` (миграция 041).

Юзер пишет короткое сообщение через FloatingFeedbackButton в правом
нижнем углу. Опционально оставляет контакт (email/tg/что хочет).

После успешного INSERT'а — best-effort SMTP-нотификация автору
(`settings.smtp_*` + `feedback_email_to`). Если SMTP-конфиг пуст
или send упал — лог + тишина для клиента; запись в БД остаётся.

Anti-spam — пока примитивно: rate-limit 5 сообщений в час с одного IP,
+ длина message ∈ [3, 4000]. Если фидбек массово польётся — добавим
hCaptcha. Сейчас сайт получает ~0 спама, поэтому overengineering.

Для просмотра фидбэка автору: `psql … -c "SELECT created_at, contact,
page_url, substring(message, 1, 120) FROM user_feedback ORDER BY 1
DESC LIMIT 50;"` — пока read-only через psql, специальный admin-UI не
строим (один-два-три сообщения в день максимум).
"""

from __future__ import annotations

import logging
import smtplib
import threading
from email.message import EmailMessage
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from api.auth.jwt_tokens import AccessTokenInvalid, decode_access_token
from api.db import get_conn
from api.rate_limit import limiter
from api.settings import settings

log = logging.getLogger("api.feedback")

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


def _send_email_notification_async(
    feedback_id: int,
    message: str,
    contact: Optional[str],
    page_url: Optional[str],
    user_agent: Optional[str],
    user_id: Optional[str],
) -> None:
    """Запускает SMTP-отправку в отдельном thread'е, не блокируя
    HTTP-ответ юзеру. Если SMTP-конфиг пуст или send упал — лог-warn,
    запись в БД остаётся (главный source-of-truth)."""
    if not (settings.smtp_host and settings.smtp_user and settings.smtp_password):
        return  # SMTP не настроен — silent skip
    to_addr = settings.feedback_email_to or settings.smtp_user

    def worker() -> None:
        try:
            msg = EmailMessage()
            msg["Subject"] = f"[geobiom] feedback #{feedback_id}"
            msg["From"] = settings.smtp_user
            msg["To"] = to_addr
            if contact:
                # Reply-To = контакт юзера, если оставил, чтобы можно было
                # ответить просто Reply из почтового клиента (если контакт
                # выглядит как email).
                msg["Reply-To"] = contact

            body_lines = [
                f"Сообщение #{feedback_id}",
                "",
                message,
                "",
                "—",
                f"Контакт:    {contact or '—'}",
                f"Страница:   {page_url or '—'}",
                f"User-Agent: {user_agent or '—'}",
                f"User ID:    {user_id or 'anon'}",
            ]
            msg.set_content("\n".join(body_lines))

            # SSL (465) или STARTTLS (587). Gmail допускает оба, Yandex
            # тоже; 465 проще без отдельного starttls() шага.
            if settings.smtp_port == 465:
                with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15) as s:
                    s.login(settings.smtp_user, settings.smtp_password)
                    s.send_message(msg)
            else:
                with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as s:
                    s.starttls()
                    s.login(settings.smtp_user, settings.smtp_password)
                    s.send_message(msg)
            log.info("feedback #%s emailed to %s", feedback_id, to_addr)
        except Exception:  # noqa: BLE001
            log.exception("feedback #%s email-send failed", feedback_id)

    threading.Thread(target=worker, daemon=True).start()


@router.post("", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/hour")
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
    _send_email_notification_async(
        feedback_id=feedback_id,
        message=message,
        contact=contact,
        page_url=page_url,
        user_agent=user_agent,
        user_id=user_id,
    )
    return {"id": feedback_id}
