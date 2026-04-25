"""Константы окружения для тестов. Отделены от conftest.py чтобы их
можно было `from _test_env import ...` (conftest не предназначен
для импорта тестами напрямую — он только автоподключается pytest'ом)."""

import os

API_BASE = os.environ.get("API_BASE", "http://localhost:8000")
DB_DSN = os.environ.get(
    "TEST_DB_DSN",
    "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map",
)
JWT_SECRET = os.environ.get(
    "TEST_JWT_SECRET",
    "change-me-in-production-a-long-random-string",
)
JWT_ISSUER = os.environ.get("TEST_JWT_ISSUER", "mushroom-map")
