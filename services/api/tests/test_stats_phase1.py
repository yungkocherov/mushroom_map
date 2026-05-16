"""
Tests for Phase-1 Статистика endpoints (/meta, /forest, /vk/timeline,
/corpus). Mirrors test_places.py: offline validation via a stubbed
get_conn + live smoke gated on a running API.
"""

from __future__ import annotations

import os
from contextlib import contextmanager

import pytest

try:
    import httpx
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
except ImportError:
    pytest.skip("fastapi/httpx not installed", allow_module_level=True)


class _FakeCursor:
    def execute(self, *_a, **_kw):
        return self
    def fetchall(self):
        return []
    def fetchone(self):
        return None


class _FakeConn:
    def execute(self, *_a, **_kw):
        return _FakeCursor()
    def __enter__(self):
        return self
    def __exit__(self, *_a):
        return False


@contextmanager
def _fake_get_conn():
    yield _FakeConn()


@pytest.fixture
def offline_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    from api.routes import stats
    monkeypatch.setattr(stats, "get_conn", _fake_get_conn)
    app = FastAPI()
    app.include_router(stats.router, prefix="/api/stats")
    return TestClient(app)


def test_meta_empty_returns_200_shape(offline_client: TestClient) -> None:
    r = offline_client.get("/api/stats/meta")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"generated_at", "forest_source_version", "vk_prompt_version"}
    assert body["generated_at"] is None
