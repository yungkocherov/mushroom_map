"""
Общие фикстуры для интеграционных тестов API.

Принцип:
  - тесты — чёрный ящик через httpx (как smoke); это уже устоявшийся
    стиль для этого репо
  - фикстуры готовят минимальный state в БД (user) и шифруют access JWT
    тем же jwt_secret, что и API — через прямой psycopg + pyjwt
  - дамп-тестовые данные не должны жить дольше теста: фикстуры
    пользуются ON DELETE CASCADE через user_id для очистки

Все фикстуры скипаются если БД или API недоступны (ту же логику
наследуют от smoke-теста).
"""

from __future__ import annotations

import os
import sys
import time
import uuid
from typing import Iterator

import pytest

# tests/ — это package (есть __init__.py), pytest по умолчанию не кладёт
# его в sys.path. Делаем это явно, чтобы _test_env импортировался и из
# conftest, и из самих test_*.py.
sys.path.insert(0, os.path.dirname(__file__))

try:
    import httpx
    import jwt as pyjwt
    import psycopg
except ImportError:
    pytest.skip("integration test deps missing (httpx + pyjwt + psycopg)",
                allow_module_level=True)


# Реэкспортируем константы окружения; реальные дефолты живут в
# _test_env.py (импортируется тестами явно).
from _test_env import API_BASE, DB_DSN, JWT_SECRET, JWT_ISSUER  # noqa: F401


def _api_is_up() -> bool:
    try:
        httpx.Client(base_url=API_BASE, timeout=2.0).get("/health")
        return True
    except Exception:
        return False


def _db_is_up() -> bool:
    try:
        with psycopg.connect(DB_DSN, connect_timeout=2):
            return True
    except Exception:
        return False


# Применяется ко всем тестам в этом каталоге, использующим фикстуры
# ниже. test_api_smoke.py, который не требует БД, наследует только
# своё условие через own pytestmark.
def pytest_collection_modifyitems(config, items):
    api_up = _api_is_up()
    db_up = _db_is_up()
    if api_up and db_up:
        return
    skip_msg = []
    if not api_up: skip_msg.append(f"API at {API_BASE} not responding")
    if not db_up:  skip_msg.append(f"DB at {DB_DSN} not reachable")
    skip_marker = pytest.mark.skip(reason="; ".join(skip_msg))
    for item in items:
        # Скипаем только тесты, которым нужен api+db (используют фикстуры
        # auth_user / cabinet_client / etc). test_api_smoke имеет свой
        # pytestmark.skipif, не трогаем его.
        fixturenames = getattr(item, "fixturenames", ())
        needs_db = any(f in fixturenames
                       for f in ("auth_user", "access_token", "cabinet_client", "db_conn"))
        if needs_db:
            item.add_marker(skip_marker)


@pytest.fixture
def db_conn() -> Iterator[psycopg.Connection]:
    with psycopg.connect(DB_DSN, autocommit=False) as conn:
        yield conn


@pytest.fixture
def auth_user(db_conn: psycopg.Connection) -> Iterator[dict]:
    """Создать тестового юзера, отдать {id, email, provider_subject}.
    Удаляется после теста — все зависимые refresh/spots снимаются ON
    DELETE CASCADE."""
    sub = f"pytest-{uuid.uuid4().hex[:10]}"
    email = f"{sub}@pytest.local"
    row = db_conn.execute(
        """
        INSERT INTO users (auth_provider, provider_subject, email, display_name)
        VALUES ('yandex', %s, %s, 'Pytest User')
        RETURNING id
        """,
        (sub, email),
    ).fetchone()
    db_conn.commit()
    user_id = row[0]
    try:
        yield {"id": user_id, "email": email, "provider_subject": sub}
    finally:
        # Гасим в отдельной транзакции на случай, если тест её сломал.
        try:
            db_conn.rollback()
        except Exception:
            pass
        db_conn.execute("DELETE FROM users WHERE id = %s", (user_id,))
        db_conn.commit()


def _encode_access(user_id: uuid.UUID, *, ttl: int = 900) -> str:
    """Локальная копия api.auth.jwt_tokens.encode_access_token, чтобы не
    тащить services/api package в pytest path."""
    now = int(time.time())
    return pyjwt.encode(
        {
            "iss": JWT_ISSUER,
            "sub": str(user_id),
            "iat": now,
            "exp": now + ttl,
            "typ": "access",
        },
        JWT_SECRET,
        algorithm="HS256",
    )


@pytest.fixture
def access_token(auth_user: dict) -> str:
    return _encode_access(auth_user["id"])


@pytest.fixture
def cabinet_client(access_token: str) -> Iterator[httpx.Client]:
    """httpx-клиент, заранее настроенный с Authorization: Bearer."""
    with httpx.Client(
        base_url=API_BASE,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10.0,
    ) as c:
        yield c
