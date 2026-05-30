"""
Unit tests for pure geo helpers in `pipelines/scrape_fgislk_attrinfo.py`.

Эти функции — последний рубеж защиты от **bogus inflated geometries**
(ФГИС WMS GetFeatureInfo иногда возвращает контур квартала/лесничества
вместо запрошенного выдела). Тестируем _geom_passes_sanity и его
зависимости (mercator math).

Особое внимание — **mercator-коррекция**: на широте ЛО 58-62°N
mercator-area в ~3.7× больше real-area. Без `cos²(lat)` поправки
sanity-check ложно отвергает легитимные узкие выделы 3-7 ha.
"""

from __future__ import annotations

import math

import pytest

from scrape_fgislk_attrinfo import (
    _geom_passes_sanity,
    _mercator_to_real_ha,
    _polygon_area_3857_m2,
    mercator_to_wgs,
    reproject_polygon_3857_to_4326,
    R_EQ,
    INFLATE_RATIO_LIMIT,
    BBOX_OVERFLOW_LIMIT,
)

# R_EQ в scrape_fgislk = half-circumference (20037508.34, not Earth radius!).
# Real-Earth radius для y-формулы: R_EARTH = R_EQ / π ≈ 6378137 м.
R_EARTH = R_EQ / math.pi


def _lat_to_3857_y(lat_deg: float) -> float:
    """EPSG:3857 y от широты, согласно той же R_EQ-конвенции что scraper."""
    return R_EARTH * math.log(math.tan(math.pi / 4 + math.radians(lat_deg) / 2))


def _lon_to_3857_x(lon_deg: float) -> float:
    """EPSG:3857 x от долготы (линейная развёртка через R_EQ-boundary)."""
    return lon_deg / 180.0 * R_EQ


# ──────────────────────────────────────────────────────────────────────
# mercator_to_wgs — sanity для координат
# ──────────────────────────────────────────────────────────────────────

def test_mercator_to_wgs_origin() -> None:
    """(0, 0) в EPSG:3857 → (0°, 0°) в WGS84."""
    lon, lat = mercator_to_wgs(0.0, 0.0)
    assert lon == pytest.approx(0.0, abs=1e-6)
    assert lat == pytest.approx(0.0, abs=1e-6)


def test_mercator_to_wgs_spb_centre() -> None:
    """СПб ~30°E, 60°N → mercator x ≈ 3.34M, y ≈ 8.40M."""
    lon, lat = mercator_to_wgs(_lon_to_3857_x(30.0), _lat_to_3857_y(60.0))
    assert lon == pytest.approx(30.0, abs=1e-3)
    assert lat == pytest.approx(60.0, abs=1e-3)


def test_mercator_to_wgs_inverse_consistency() -> None:
    """Round-trip lon/lat → 3857 → lon/lat через ту же R_EQ-конвенцию."""
    lon0, lat0 = 30.5, 60.05
    x = _lon_to_3857_x(lon0)
    y = _lat_to_3857_y(lat0)
    lon, lat = mercator_to_wgs(x, y)
    assert lon == pytest.approx(lon0, abs=1e-6)
    assert lat == pytest.approx(lat0, abs=1e-6)


# ──────────────────────────────────────────────────────────────────────
# reproject_polygon_3857_to_4326 — рекурсивный walk через nested coords
# ──────────────────────────────────────────────────────────────────────

def test_reproject_single_point() -> None:
    result = reproject_polygon_3857_to_4326([0.0, 0.0])
    assert result == [pytest.approx(0.0), pytest.approx(0.0)]


def test_reproject_polygon_ring() -> None:
    """Polygon[[ring]] — 2 уровня вложенности."""
    coords = [[[0.0, 0.0], [1000000.0, 0.0], [0.0, 1000000.0], [0.0, 0.0]]]
    out = reproject_polygon_3857_to_4326(coords)
    assert isinstance(out, list)
    assert len(out) == 1                          # 1 ring
    assert len(out[0]) == 4                       # 4 vertices
    assert len(out[0][0]) == 2                    # каждая точка [lon, lat]


def test_reproject_multipolygon() -> None:
    """MultiPolygon — 3 уровня."""
    coords = [
        [[[0.0, 0.0], [1000.0, 0.0], [0.0, 1000.0], [0.0, 0.0]]],
        [[[2000.0, 2000.0], [3000.0, 2000.0], [2000.0, 3000.0], [2000.0, 2000.0]]],
    ]
    out = reproject_polygon_3857_to_4326(coords)
    assert len(out) == 2
    for poly in out:
        assert isinstance(poly[0][0][0], float)   # lon — float
        assert isinstance(poly[0][0][1], float)   # lat — float


# ──────────────────────────────────────────────────────────────────────
# _polygon_area_3857_m2 — shoelace в mercator
# ──────────────────────────────────────────────────────────────────────

def test_polygon_area_unit_square() -> None:
    """100×100 m² square at origin → 10000 m²."""
    poly = {"type": "Polygon", "coordinates": [[
        [0, 0], [100, 0], [100, 100], [0, 100], [0, 0]
    ]]}
    assert _polygon_area_3857_m2(poly) == pytest.approx(10000.0)


def test_polygon_area_handles_ccw_and_cw() -> None:
    """Direction-independent (abs)."""
    ccw = {"type": "Polygon", "coordinates": [[
        [0, 0], [100, 0], [100, 100], [0, 100], [0, 0]
    ]]}
    cw = {"type": "Polygon", "coordinates": [[
        [0, 0], [0, 100], [100, 100], [100, 0], [0, 0]
    ]]}
    assert _polygon_area_3857_m2(ccw) == _polygon_area_3857_m2(cw)


def test_polygon_area_multipolygon_sums() -> None:
    """MultiPolygon = sum of polygon areas."""
    mp = {"type": "MultiPolygon", "coordinates": [
        [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],   # 100 m²
        [[[100, 100], [110, 100], [110, 110], [100, 110], [100, 100]]],  # 100 m²
    ]}
    assert _polygon_area_3857_m2(mp) == pytest.approx(200.0)


def test_polygon_area_invalid_geom_returns_zero() -> None:
    """Unknown / missing type → 0 (не падать)."""
    assert _polygon_area_3857_m2({}) == 0.0
    assert _polygon_area_3857_m2({"type": "LineString", "coordinates": [[0, 0]]}) == 0.0
    assert _polygon_area_3857_m2({"type": "Polygon", "coordinates": [[[0, 0]]]}) == 0.0


# ──────────────────────────────────────────────────────────────────────
# _mercator_to_real_ha — критическая cos²(lat) коррекция
# ──────────────────────────────────────────────────────────────────────

def test_mercator_to_real_ha_equator_unchanged() -> None:
    """На экваторе cos²(0)=1 → real ≈ mercator (в гектарах)."""
    # 10000 m² @ y=0 (экватор) → 1 ha
    assert _mercator_to_real_ha(10000.0, 0.0) == pytest.approx(1.0, rel=1e-3)


def test_mercator_to_real_ha_lo_centre() -> None:
    """На 58.8°N (центр ЛО) mercator растяжен ~3.7× → real ≈ mercator/3.7."""
    y_lo = _lat_to_3857_y(58.8)
    # 37000 m² mercator (≈ 3.7 ha) → ~1 ha real
    real_ha = _mercator_to_real_ha(37000.0, y_lo)
    # cos²(58.8°) ≈ 0.268 → 37000 * 0.268 / 10000 ≈ 0.99 ha
    assert 0.9 < real_ha < 1.05, f"real_ha={real_ha} expected ~1.0"


def test_mercator_to_real_ha_progression() -> None:
    """С ростом широты cos² уменьшается → real_ha падает."""
    y_0  = 0.0                                # экватор
    y_60 = _lat_to_3857_y(60)
    y_85 = _lat_to_3857_y(85)
    fixed_merc = 10000.0
    assert _mercator_to_real_ha(fixed_merc, y_0) > \
           _mercator_to_real_ha(fixed_merc, y_60) > \
           _mercator_to_real_ha(fixed_merc, y_85)


# ──────────────────────────────────────────────────────────────────────
# _geom_passes_sanity — INTEGRATION тест защиты от bogus inflate
# ──────────────────────────────────────────────────────────────────────

def _make_square_poly(side_m: float, cx: float, cy: float) -> dict:
    """Квадратный Polygon side_m × side_m в 3857 (мерах), центр (cx, cy)."""
    h = side_m / 2
    return {"type": "Polygon", "coordinates": [[
        [cx - h, cy - h], [cx + h, cy - h],
        [cx + h, cy + h], [cx - h, cy + h], [cx - h, cy - h]
    ]]}


# y координата для LO центра (58.8°N) в EPSG:3857
LO_Y = _lat_to_3857_y(58.8)


def test_sanity_legit_vydel_passes() -> None:
    """Real-world 5 ha vydel на широте ЛО: mercator-area ~18.7 ha,
    real-area 5 ha — соответствует declared square_ha=5. Должен пройти."""
    # 5 ha = 50000 m² real. На 58.8°N mercator = 50000 / cos²(58.8°) ≈ 186600 m²
    # side ≈ sqrt(186600) ≈ 432 m
    poly = _make_square_poly(432.0, 0.0, LO_Y)
    bbox = (-300.0, LO_Y - 300.0, 300.0, LO_Y + 300.0)
    # expected square_ha=5 → real/expected = ~1.0 → passes
    assert _geom_passes_sanity(poly, expected_square_ha=5.0, bbox_3857=bbox)


def test_sanity_bogus_inflate_rejected() -> None:
    """ФГИС вернул контур квартала вместо выдела: 200 ha mercator vs declared
    square_ha=5. Mercator-real ~53 ha. Ratio 53/5 = 10.6 > INFLATE_RATIO_LIMIT=3.
    Должен быть отвергнут."""
    # 200 ha mercator = 2000000 m². side = sqrt(2000000) ≈ 1414 m
    poly = _make_square_poly(1414.0, 0.0, LO_Y)
    bbox = (-1000.0, LO_Y - 1000.0, 1000.0, LO_Y + 1000.0)
    assert not _geom_passes_sanity(poly, expected_square_ha=5.0, bbox_3857=bbox)


def test_sanity_no_expected_square_falls_back_to_bbox_check() -> None:
    """Без declared square_ha sanity check проверяет только bbox-overflow."""
    # Tight square внутри bbox — должен пройти
    poly = _make_square_poly(100.0, 0.0, LO_Y)
    bbox = (-200.0, LO_Y - 200.0, 200.0, LO_Y + 200.0)
    assert _geom_passes_sanity(poly, expected_square_ha=None, bbox_3857=bbox)


def test_sanity_bbox_overflow_rejected() -> None:
    """Геометрия в 3× больше своего bbox — bogus (ФГИС иногда отдаёт
    overlapping polygon)."""
    # poly 1000×1000 (10⁶ m²), bbox 500×500 (2.5*10⁵ m²) → ratio 4 > LIMIT=2
    poly = _make_square_poly(1000.0, 0.0, LO_Y)
    bbox = (-250.0, LO_Y - 250.0, 250.0, LO_Y + 250.0)
    assert not _geom_passes_sanity(poly, expected_square_ha=None, bbox_3857=bbox)


def test_sanity_zero_area_geom_rejected() -> None:
    """Пустой/degenerate geom → reject."""
    bbox = (0.0, LO_Y, 1.0, LO_Y + 1.0)
    assert not _geom_passes_sanity({"type": "Polygon", "coordinates": []}, 1.0, bbox)


def test_inflate_limit_is_3() -> None:
    """Контракт: INFLATE_RATIO_LIMIT = 3.0 (документировано в CLAUDE.md)."""
    assert INFLATE_RATIO_LIMIT == 3.0


def test_bbox_overflow_limit_is_2() -> None:
    assert BBOX_OVERFLOW_LIMIT == 2.0


# ──────────────────────────────────────────────────────────────────────
# Boundary tests — конкретно crit edge cases
# ──────────────────────────────────────────────────────────────────────

def test_narrow_high_lat_vydel_not_falsely_rejected() -> None:
    """REGRESSION: до mercator-коррекции узкие выделы на 61°N (Подпорожский)
    ложно отвергались. С коррекцией должны проходить."""
    # 3 ha vydel @ 61°N (Подпорожье). cos²(61°) ≈ 0.235. mercator = 30000/0.235 ≈ 127660 m²
    y_61 = _lat_to_3857_y(61)
    side = math.sqrt(127660)
    poly = _make_square_poly(side, 0.0, y_61)
    bbox = (-side, y_61 - side, side, y_61 + side)
    assert _geom_passes_sanity(poly, expected_square_ha=3.0, bbox_3857=bbox), \
        "узкий выдел на 61°N ложно отвергается без cos²(lat) коррекции"
