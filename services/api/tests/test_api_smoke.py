"""
Smoke-тесты FastAPI-эндпоинтов. Гоняют реальный HTTP по живому API
(mushroom_api в docker-compose, порт 8000). Проверяют основные happy
path'ы + несколько edge-cases которые недавно ломались.

Запуск: `pytest services/api/tests/` при поднятом docker compose.
Если API не отвечает — тесты пропускаются (не фейлят CI без инфры).

Замечание: это чёрный ящик (нет mock'ов БД, нет TestClient). Такой
подход выбран сознательно — мы проверяем что РЕАЛЬНЫЙ сервис отвечает,
включая связку FastAPI ↔ psycopg ↔ PostGIS ↔ PMTiles ↔ данные.
"""

from __future__ import annotations

import os

import pytest

try:
    import httpx
except ImportError:
    pytest.skip("httpx is not installed", allow_module_level=True)

API_BASE = os.environ.get("API_BASE", "http://localhost:8000")
CLIENT = httpx.Client(base_url=API_BASE, timeout=10.0)


def _api_is_up() -> bool:
    try:
        CLIENT.get("/api/regions/", timeout=2.0)
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not _api_is_up(),
    reason=f"API at {API_BASE} is not responding — start docker compose",
)


# ─── /api/regions/ ───────────────────────────────────────────────────────────


def test_regions_list_returns_json_array() -> None:
    """Endpoint может быть stub'ом (возвращать []), важно чтобы 200 + list."""
    r = CLIENT.get("/api/regions/")
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)


# ─── /api/forest/at?lat=&lon= ────────────────────────────────────────────────


def test_forest_at_outside_data_returns_null() -> None:
    """Точка посреди Тихого океана — нет леса, forest: null."""
    r = CLIENT.get("/api/forest/at", params={"lat": 0.0, "lon": -170.0})
    assert r.status_code == 200
    data = r.json()
    assert data["forest"] is None
    assert data["species_theoretical"] == []


def test_forest_at_karelian_isthmus_has_data() -> None:
    """Точка в Карельском перешейке должна попасть в rosleshoz-полигон."""
    r = CLIENT.get("/api/forest/at", params={"lat": 59.767, "lon": 29.857})
    assert r.status_code == 200
    data = r.json()
    if data["forest"] is None:
        pytest.skip("no forest data in this DB — CI runs against empty Postgres")
    f = data["forest"]
    # Rosleshoz всегда даёт эти поля
    assert f["source"] == "rosleshoz"
    assert f["dominant_species"] in {
        "pine", "spruce", "birch", "aspen", "alder", "oak",
        "linden", "maple", "larch", "fir", "cedar",
        "mixed", "mixed_coniferous", "mixed_broadleaved", "unknown",
    }
    # bonitet / timber_stock / age_group в meta → в response promoted в forest
    # Для большинства rosleshoz-полигонов bonitet != null
    assert "bonitet" in f
    assert "timber_stock" in f
    assert "age_group" in f


def test_forest_at_returns_species_theoretical() -> None:
    """Для леса должны возвращаться теоретические виды с affinity."""
    r = CLIENT.get("/api/forest/at", params={"lat": 59.767, "lon": 29.857})
    data = r.json()
    if data["forest"] is None:
        pytest.skip("no forest at test point — data missing")
    species = data["species_theoretical"]
    assert isinstance(species, list)
    # Для основных пород (pine/spruce/birch) теоретических видов много
    if data["forest"]["dominant_species"] in ("pine", "spruce", "birch"):
        assert len(species) > 0
        s0 = species[0]
        assert "slug" in s0
        assert "name_ru" in s0
        assert "affinity" in s0
        assert 0 <= s0["affinity"] <= 1


# ─── /api/species/search?q= ──────────────────────────────────────────────────


def test_species_search_ascii() -> None:
    """ASCII query — должен возвращать 200 даже если пусто."""
    r = CLIENT.get("/api/species/search", params={"q": "xyz-nomatch"})
    assert r.status_code == 200
    assert r.json() == []


def test_species_search_cyrillic() -> None:
    """Регрессия: раньше кириллица давала 500 → CORS-ошибка в браузере.
    Баг был в SQL: SELECT DISTINCT + ORDER BY не в SELECT-list."""
    r = CLIENT.get("/api/species/search", params={"q": "белый", "limit": 3})
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    if items:
        s0 = items[0]
        assert "slug" in s0
        assert "name_ru" in s0
        assert "forest_types" in s0
        assert isinstance(s0["forest_types"], list)


def test_species_search_limit_boundary() -> None:
    """limit=1 работает; limit=0 отклоняется (ge=1)."""
    r1 = CLIENT.get("/api/species/search", params={"q": "гриб", "limit": 1})
    assert r1.status_code == 200
    assert len(r1.json()) <= 1
    r0 = CLIENT.get("/api/species/search", params={"q": "гриб", "limit": 0})
    assert r0.status_code == 422  # validation error


def test_species_search_empty_q_rejected() -> None:
    """Пустой запрос (min_length=1) отклоняется."""
    r = CLIENT.get("/api/species/search", params={"q": ""})
    assert r.status_code == 422


# ─── /tiles/forest.pmtiles (sanity) ──────────────────────────────────────────


def test_forest_tiles_served_with_range() -> None:
    """PMTiles должен поддерживать HTTP Range — MapLibre это использует."""
    r = CLIENT.get("/tiles/forest.pmtiles", headers={"Range": "bytes=0-1023"})
    if r.status_code == 404:
        pytest.skip("forest.pmtiles not built in this env — CI doesn't build tiles")
    assert r.status_code in (200, 206), f"unexpected {r.status_code}"
    assert len(r.content) <= 1024
    # Accept-Ranges должен быть bytes (для Range support)
    accept_ranges = r.headers.get("accept-ranges", "")
    assert accept_ranges == "bytes" or r.status_code == 206


# ─── /api/cabinet/spots (auth gate regression guard) ────────────────────────
# Полноценные CRUD-тесты потребовали бы создавать тестового юзера в БД и
# выпускать access JWT — не лезет в смок-стиль («чёрный ящик, без
# фикстур»). Поэтому здесь только проверяем что auth-гейт стоит и
# реагирует на отсутствие/мусорный токен. Реальный CRUD проверен в
# Phase 5 e2e-скрипте при коммите.


def test_cabinet_spots_requires_auth() -> None:
    r = CLIENT.get("/api/cabinet/spots")
    assert r.status_code == 401
    assert "bearer" in r.json().get("detail", "").lower()


def test_cabinet_create_requires_auth() -> None:
    r = CLIENT.post(
        "/api/cabinet/spots",
        json={"name": "x", "lat": 60.0, "lon": 30.0},
    )
    assert r.status_code == 401


def test_cabinet_rejects_garbage_token() -> None:
    r = CLIENT.get("/api/cabinet/spots", headers={"Authorization": "Bearer garbage"})
    assert r.status_code == 401
    assert "invalid" in r.json().get("detail", "").lower()


def test_cabinet_rejects_wrong_scheme() -> None:
    """Authorization: Basic … должно отклоняться так же, как отсутствие."""
    r = CLIENT.get("/api/cabinet/spots", headers={"Authorization": "Basic abc"})
    assert r.status_code == 401


# ─── /api/auth/* (auth-gate regression) ────────────────────────────────────


def test_auth_refresh_without_cookie_401() -> None:
    r = CLIENT.post("/api/auth/refresh")
    assert r.status_code == 401


def test_auth_logout_without_cookie_204() -> None:
    """logout идемпотентен — нет cookie, тоже OK."""
    r = CLIENT.post("/api/auth/logout")
    assert r.status_code == 204


def test_user_me_requires_bearer() -> None:
    r = CLIENT.get("/api/user/me")
    assert r.status_code == 401


# ─── /api/species/ (Phase 3 list endpoint) ─────────────────────────────────


def test_species_list_returns_array() -> None:
    """Список вида — массив с минимальным набором полей."""
    r = CLIENT.get("/api/species/")
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    assert len(items) > 0
    s0 = items[0]
    for key in ("slug", "name_ru", "edibility", "season_months",
                "photo_url", "red_book", "forest_types"):
        assert key in s0, f"missing key: {key}"
    assert s0["edibility"] in {
        "edible", "conditionally_edible", "inedible", "toxic", "deadly"
    }


def test_species_detail_known_slug() -> None:
    r = CLIENT.get("/api/species/boletus-edulis")
    if r.status_code == 404:
        pytest.skip("species seed not loaded — CI runs against empty Postgres")
    assert r.status_code == 200
    d = r.json()
    assert d["slug"] == "boletus-edulis"
    assert d["edibility"] in {"edible", "conditionally_edible"}
    # forests — массив (может быть пустым), similars — массив
    assert isinstance(d["forests"], list)
    assert isinstance(d["similars"], list)


def test_species_detail_404_on_unknown_slug() -> None:
    r = CLIENT.get("/api/species/this-mushroom-does-not-exist")
    assert r.status_code == 404
