"""Database connection pool (psycopg-pool, sync)."""

from contextlib import contextmanager
from typing import Generator

import psycopg
from psycopg_pool import ConnectionPool

from api.settings import settings

_pool: ConnectionPool | None = None


def init_pool() -> None:
    global _pool
    _pool = ConnectionPool(
        settings.database_url,
        min_size=2,
        max_size=10,
        open=True,
    )


def close_pool() -> None:
    if _pool is not None:
        _pool.close()


@contextmanager
def get_conn() -> Generator[psycopg.Connection, None, None]:
    if _pool is None:
        raise RuntimeError("DB pool not initialised — check lifespan setup")
    with _pool.connection() as conn:
        yield conn
