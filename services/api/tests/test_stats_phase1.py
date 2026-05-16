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


def test_forest_default_dimension_empty_shape(offline_client: TestClient) -> None:
    r = offline_client.get("/api/stats/forest")
    assert r.status_code == 200
    body = r.json()
    assert body == {"dimension": "species", "items": []}


def test_forest_bad_dimension_rejected(offline_client: TestClient) -> None:
    r = offline_client.get("/api/stats/forest", params={"dimension": "banana"})
    assert r.status_code == 422


def test_timeline_empty_shape(offline_client: TestClient) -> None:
    r = offline_client.get("/api/stats/vk/timeline")
    assert r.status_code == 200
    body = r.json()
    assert body == {"group": "all", "items": []}


def test_timeline_limit_validation(offline_client: TestClient) -> None:
    r = offline_client.get("/api/stats/vk/timeline", params={"limit": 0})
    assert r.status_code == 422


def test_corpus_empty_shape(offline_client: TestClient) -> None:
    r = offline_client.get("/api/stats/corpus")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"metrics", "classification", "sources"}
    assert body["metrics"] == {}
    assert body["classification"] == []
    assert body["sources"] == {}


# ──────────────────────────────────────────────────────────────────────
# Live smoke (требует поднятого API + наполненного snapshot)
# ──────────────────────────────────────────────────────────────────────
API_BASE = os.environ.get("API_BASE", "http://localhost:8000")
_SMOKE = httpx.Client(base_url=API_BASE, timeout=10.0)


def _api_up() -> bool:
    try:
        r = _SMOKE.get("/api/stats/meta", timeout=2.0)
        return r.status_code != 404
    except Exception:
        return False


smoke = pytest.mark.skipif(not _api_up(), reason=f"API at {API_BASE} down")


@smoke
def test_smoke_meta_has_generated_at() -> None:
    r = _SMOKE.get("/api/stats/meta")
    assert r.status_code == 200
    assert "generated_at" in r.json()


@smoke
def test_smoke_forest_species_nonempty() -> None:
    r = _SMOKE.get("/api/stats/forest", params={"dimension": "species"})
    assert r.status_code == 200
    body = r.json()
    assert body["dimension"] == "species"
    if not body["items"]:
        pytest.skip("snapshot not built in this DB")
    first = body["items"][0]
    assert {"key", "label", "area_km2", "polygon_count", "pct"}.issubset(first)


def test_weather_empty_shape(offline_client: TestClient) -> None:
    r = offline_client.get("/api/stats/weather")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"months", "climatology"}
    assert body["months"] == []
    assert body["climatology"] == []


@smoke
def test_smoke_weather_shape() -> None:
    r = _SMOKE.get("/api/stats/weather")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"months", "climatology"}
    for rec in body["months"][:1] + body["climatology"][:1]:
        assert {"year", "month", "temp_mean", "precip_sum", "soil_moist_mean"}.issubset(rec)
