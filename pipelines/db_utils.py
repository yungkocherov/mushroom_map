"""DSN-резолвер для всех pipeline-скриптов.

Порядок приоритетов: --dsn CLI → DATABASE_URL → POSTGRES_* → дефолты для
локальной разработки (порт 5434, mushroom/mushroom_dev). 5434, не 5432:
host'овый Postgres сидит на 5432, а наш контейнер пробрасывается на 5434.
"""

from __future__ import annotations

import os


def build_dsn() -> str:
    if url := os.environ.get("DATABASE_URL"):
        return url
    user = os.environ.get("POSTGRES_USER", "mushroom")
    pw   = os.environ.get("POSTGRES_PASSWORD", "mushroom_dev")
    host = os.environ.get("POSTGRES_HOST", "127.0.0.1")
    port = os.environ.get("POSTGRES_PORT", "5434")
    db   = os.environ.get("POSTGRES_DB", "mushroom_map")
    return f"postgresql://{user}:{pw}@{host}:{port}/{db}"


def resolve_dsn(args_dsn: str | None) -> str:
    return args_dsn or build_dsn()
