"""
Tests for /api/places/search.

Two layers:
  - Validation tests: spin up a FastAPI app with ONLY the places router,
    monkeypatch `get_conn` to return an empty in-memory cursor. This
    runs offline (no DB, no docker). Verifies pydantic-level rejection.
  - Smoke tests: live API + DB. Skipped automatically if either is down
    (same logic as test_api_smoke.py).
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


# ──────────────────────────────────────────────────────────────────────
# Offline validation tests (no DB)
# ──────────────────────────────────────────────────────────────────────

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
    """FastAPI TestClient with places router and stubbed DB."""
    from api.routes import places
    monkeypatch.setattr(places, "get_conn", _fake_get_conn)
    app = FastAPI()
    app.include_router(places.router, prefix="/api/places")
    return TestClient(app)


def test_search_q_too_short_rejected(offline_client: TestClient) -> None:
    r = offline_client.get("/api/places/search", params={"q": "a"})
    assert r.status_code == 422


def test_search_q_missing_rejected(offline_client: TestClient) -> None:
    r = offline_client.get("/api/places/search")
    assert r.status_code == 422


def test_search_limit_zero_rejected(offline_client: TestClient) -> None:
    r = offline_client.get("/api/places/search", params={"q": "ab", "limit": 0})
    assert r.status_code == 422


def test_search_limit_too_large_rejected(offline_client: TestClient) -> None:
    r = offline_client.get("/api/places/search", params={"q": "ab", "limit": 999})
    assert r.status_code == 422


def test_search_q_too_long_rejected(offline_client: TestClient) -> None:
    r = offline_client.get("/api/places/search", params={"q": "a" * 250})
    assert r.status_code == 422


def test_search_returns_empty_list_when_no_rows(offline_client: TestClient) -> None:
    """Stubbed DB returns no rows — endpoint should respond [], not 500."""
    r = offline_client.get("/api/places/search", params={"q": "лемболово"})
    assert r.status_code == 200
    assert r.json() == []


def test_search_default_limit_is_10(offline_client: TestClient) -> None:
    """Sanity check that default limit doesn't change without notice."""
    from api.routes import places
    sig = places.search_places.__defaults__ or ()
    # Default values are pydantic Query objects; check their `default`.
    defaults = [getattr(d, "default", d) for d in sig]
    assert 10 in defaults  # limit's default
    assert "lenoblast" in defaults  # region's default


# ──────────────────────────────────────────────────────────────────────
# Smoke tests (live API + DB)
# ──────────────────────────────────────────────────────────────────────

API_BASE = os.environ.get("API_BASE", "http://localhost:8000")
_SMOKE_CLIENT = httpx.Client(base_url=API_BASE, timeout=10.0)


def _api_is_up() -> bool:
    try:
        _SMOKE_CLIENT.get("/api/regions/", timeout=2.0)
        return True
    except Exception:
        return False


smoke = pytest.mark.skipif(
    not _api_is_up(),
    reason=f"API at {API_BASE} not responding — start docker compose",
)


@smoke
def test_smoke_search_returns_list() -> None:
    r = _SMOKE_CLIENT.get("/api/places/search", params={"q": "ле"})
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)


@smoke
def test_smoke_search_result_shape() -> None:
    r = _SMOKE_CLIENT.get("/api/places/search", params={"q": "лемболово", "limit": 5})
    assert r.status_code == 200
    items = r.json()
    if not items:
        pytest.skip("gazetteer is empty in this DB — CI runs against empty Postgres")
    expected = {
        "id", "name", "kind", "lat", "lon",
        "district_admin_area_id", "popularity", "score",
    }
    for item in items:
        assert expected.issubset(item.keys()), f"missing keys: {expected - item.keys()}"
        assert -90 <= item["lat"] <= 90
        assert -180 <= item["lon"] <= 180
        assert item["kind"] in {
            "settlement", "tract", "lake", "river",
            "district", "station", "poi",
        }


@smoke
def test_smoke_search_respects_limit() -> None:
    r = _SMOKE_CLIENT.get("/api/places/search", params={"q": "оз", "limit": 3})
    assert r.status_code == 200
    items = r.json()
    assert len(items) <= 3
