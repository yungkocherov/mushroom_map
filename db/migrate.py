"""
Простой раннер миграций. Идемпотентно прогоняет все *.sql из db/migrations/
в лексикографическом порядке, отмечая выполненные в таблице schema_migrations.

Использование:
    python db/migrate.py              # применить все новые
    python db/migrate.py --dry-run    # показать, что будет применено
    python db/migrate.py --list       # список и статус
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import psycopg


MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def ensure_schema_migrations_table(conn: psycopg.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            filename   TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    conn.commit()


def applied_filenames(conn: psycopg.Connection) -> set[str]:
    cur = conn.execute("SELECT filename FROM schema_migrations")
    return {row[0] for row in cur.fetchall()}


def discover_migrations() -> list[Path]:
    return sorted(MIGRATIONS_DIR.glob("*.sql"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dsn", default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--list", action="store_true")
    args = parser.parse_args()

    dsn = args.dsn or os.environ.get("DATABASE_URL")
    if not dsn:
        print("ERROR: DATABASE_URL не задан", file=sys.stderr)
        sys.exit(2)

    migrations = discover_migrations()
    if not migrations:
        print("Миграций не найдено.")
        return

    with psycopg.connect(dsn, autocommit=False) as conn:
        ensure_schema_migrations_table(conn)
        applied = applied_filenames(conn)

        if args.list:
            for m in migrations:
                mark = "✓" if m.name in applied else " "
                print(f"  [{mark}] {m.name}")
            return

        pending = [m for m in migrations if m.name not in applied]
        if not pending:
            print("Все миграции уже применены.")
            return

        for m in pending:
            print(f"→ {m.name}")
            if args.dry_run:
                continue
            sql = m.read_text(encoding="utf-8")
            try:
                conn.execute(sql)
                conn.execute(
                    "INSERT INTO schema_migrations (filename) VALUES (%s)",
                    (m.name,),
                )
                conn.commit()
            except Exception as e:
                conn.rollback()
                print(f"  ОШИБКА: {e}", file=sys.stderr)
                sys.exit(1)

        print(f"Применено миграций: {len(pending)}")


if __name__ == "__main__":
    main()
