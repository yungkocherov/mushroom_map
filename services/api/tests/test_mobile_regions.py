"""Tests для GET /api/mobile/regions.

Покрывает:
- 503 если manifest отсутствует
- 200 + parsed manifest если есть
- response shape соответствует RegionsResponse pydantic model
- bbox порядок [south, west, north, east]
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def fresh_settings(tmp_path: Path, monkeypatch):
    """Изолированный tiles_dir для каждого теста."""
    tiles_dir = tmp_path / "tiles"
    tiles_dir.mkdir()
    # Settings — single-instance, поэтому подсовываем через monkeypatch
    from api.settings import settings as live_settings
    monkeypatch.setattr(live_settings, "tiles_dir", str(tiles_dir))
    return tiles_dir


def _make_app():
    """Свежий FastAPI без lifespan (без БД для unit-теста manifest).

    Точечный mount только router — не вытягиваем всю main.py с db_pool init.
    """
    from fastapi import FastAPI
    from api.routes import mobile

    app = FastAPI()
    app.include_router(mobile.router, prefix="/api/mobile")
    return app


def test_regions_returns_503_if_manifest_missing(fresh_settings: Path):
    client = TestClient(_make_app())
    resp = client.get("/api/mobile/regions")
    assert resp.status_code == 503
    assert "manifest" in resp.json()["detail"].lower()


def test_regions_returns_parsed_manifest(fresh_settings: Path):
    manifest = {
        "version": "2026-05-01",
        "generated_at": 1777667319,
        "base_url": "https://api.geobiom.ru/tiles",
        "regions": [
            {
                "slug": "luzhsky",
                "name": "Лужский район",
                "bbox": [58.4, 28.6, 59.3, 31.0],
                "layers": [
                    {
                        "name": "forest",
                        "url": "https://api.geobiom.ru/tiles/districts/luzhsky/forest.pmtiles",
                        "size_bytes": 40_345_678,
                        "sha256": "a" * 64,
                    },
                ],
                "total_size_bytes": 40_345_678,
                "manifest_version": "2026-05-01",
            }
        ],
    }
    (fresh_settings / "regions.json").write_text(
        json.dumps(manifest, ensure_ascii=False),
        encoding="utf-8",
    )
    client = TestClient(_make_app())

    resp = client.get("/api/mobile/regions")
    assert resp.status_code == 200
    body = resp.json()
    assert body["version"] == "2026-05-01"
    assert body["base_url"] == "https://api.geobiom.ru/tiles"
    assert len(body["regions"]) == 1
    region = body["regions"][0]
    assert region["slug"] == "luzhsky"
    assert region["name"] == "Лужский район"
    assert region["bbox"] == [58.4, 28.6, 59.3, 31.0]
    assert len(region["layers"]) == 1
    assert region["layers"][0]["name"] == "forest"
    assert region["layers"][0]["size_bytes"] == 40_345_678
    assert len(region["layers"][0]["sha256"]) == 64


def test_regions_handles_malformed_json(fresh_settings: Path):
    (fresh_settings / "regions.json").write_text("{ not json", encoding="utf-8")
    client = TestClient(_make_app())
    resp = client.get("/api/mobile/regions")
    assert resp.status_code == 503


def test_regions_handles_empty_regions_array(fresh_settings: Path):
    manifest = {
        "version": "0",
        "generated_at": 0,
        "base_url": "",
        "regions": [],
    }
    (fresh_settings / "regions.json").write_text(
        json.dumps(manifest), encoding="utf-8",
    )
    client = TestClient(_make_app())
    resp = client.get("/api/mobile/regions")
    assert resp.status_code == 200
    assert resp.json()["regions"] == []
