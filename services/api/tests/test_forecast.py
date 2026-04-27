"""
Unit tests for the seeded-fixture forecast.

These hit the pure helper functions directly (no DB, no HTTP) so they
can run offline. The smoke test for the live HTTP endpoint lives in
test_api_smoke.py and skips without a running API.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from api.routes import forecast as fc


# ──────────────────────────────────────────────────────────────────────
# _hash_to_unit
# ──────────────────────────────────────────────────────────────────────

def test_hash_to_unit_in_range_and_deterministic() -> None:
    a = fc._hash_to_unit("a", 1, "2026-05-01")
    b = fc._hash_to_unit("a", 1, "2026-05-01")
    assert 0.0 <= a < 1.0
    assert a == b


def test_hash_to_unit_changes_on_input_change() -> None:
    a = fc._hash_to_unit("a", 1, "2026-05-01")
    b = fc._hash_to_unit("a", 1, "2026-05-02")
    c = fc._hash_to_unit("a", 2, "2026-05-01")
    assert a != b
    assert a != c


# ──────────────────────────────────────────────────────────────────────
# _seasonal_factor
# ──────────────────────────────────────────────────────────────────────

def test_seasonal_factor_peaks_in_august() -> None:
    aug = fc._seasonal_factor(date(2026, 8, 5))
    feb = fc._seasonal_factor(date(2026, 2, 1))
    assert aug > 0.9
    assert feb < 0.1


def test_seasonal_factor_has_spring_bump_for_morels() -> None:
    """Day-of-year ~130 (early May) gets a small bump for morchella."""
    may = fc._seasonal_factor(date(2026, 5, 10))  # doy ≈ 130
    apr = fc._seasonal_factor(date(2026, 4, 1))   # doy ≈ 91
    assert may > apr  # spring bump is real


# ──────────────────────────────────────────────────────────────────────
# _geo_bias
# ──────────────────────────────────────────────────────────────────────

def test_geo_bias_south_warmer_than_north() -> None:
    south = fc._geo_bias(58.7, 30.0)  # close to bbox south edge
    north = fc._geo_bias(61.6, 30.0)  # close to north edge
    assert south > north


def test_geo_bias_west_warmer_than_east() -> None:
    west = fc._geo_bias(60.0, 28.5)
    east = fc._geo_bias(60.0, 35.5)
    assert west > east


# ──────────────────────────────────────────────────────────────────────
# _district_index
# ──────────────────────────────────────────────────────────────────────

def test_district_index_in_range() -> None:
    idx = fc._district_index(1130439, date(2026, 8, 5), 58.74, 29.84)  # Лужский
    assert 0.0 <= idx <= 5.0


def test_district_index_deterministic_for_same_inputs() -> None:
    args = (1130439, date(2026, 8, 5), 58.74, 29.84)
    assert fc._district_index(*args) == fc._district_index(*args)


def test_district_index_changes_with_date() -> None:
    args_a = (1130439, date(2026, 8, 5), 58.74, 29.84)
    args_b = (1130439, date(2026, 8, 6), 58.74, 29.84)
    assert fc._district_index(*args_a) != fc._district_index(*args_b)


def test_district_index_summer_higher_than_winter_avg() -> None:
    """
    Across all 18 districts, mean August index should be far higher
    than mean February index. Single-district can fluctuate.
    """
    centroids = [(60.0, 30.0), (59.5, 28.5), (61.0, 33.0), (60.0, 35.0)]
    summer = [
        fc._district_index(1000 + i, date(2026, 8, 5), lat, lon)
        for i, (lat, lon) in enumerate(centroids)
    ]
    winter = [
        fc._district_index(1000 + i, date(2026, 2, 5), lat, lon)
        for i, (lat, lon) in enumerate(centroids)
    ]
    assert sum(summer) / len(summer) > sum(winter) / len(winter) + 1.5


# ──────────────────────────────────────────────────────────────────────
# _top_species_for
# ──────────────────────────────────────────────────────────────────────

def test_top_species_returns_n_objects_with_required_keys() -> None:
    res = fc._top_species_for(1130439, date(2026, 8, 5), n=3)
    assert len(res) == 3
    for item in res:
        assert set(item.keys()) == {"slug", "score"}
        assert isinstance(item["slug"], str)
        assert isinstance(item["score"], float)
        assert 0.0 <= item["score"] <= 1.0


def test_top_species_sorted_descending_by_score() -> None:
    res = fc._top_species_for(1130439, date(2026, 8, 5), n=5)
    scores = [r["score"] for r in res]
    assert scores == sorted(scores, reverse=True)


def test_top_species_slugs_from_frozen_pool() -> None:
    res = fc._top_species_for(1130439, date(2026, 8, 5), n=3)
    for item in res:
        assert item["slug"] in fc._FORECAST_SPECIES_POOL


def test_top_species_deterministic() -> None:
    a = fc._top_species_for(1130439, date(2026, 8, 5))
    b = fc._top_species_for(1130439, date(2026, 8, 5))
    assert a == b


def test_top_species_changes_with_district() -> None:
    a = fc._top_species_for(1130439, date(2026, 8, 5))
    b = fc._top_species_for(1162550, date(2026, 8, 5))
    # Same date, different district — at least one slug should differ.
    assert {x["slug"] for x in a} != {x["slug"] for x in b}


# ──────────────────────────────────────────────────────────────────────
# _district_slug_from_code
# ──────────────────────────────────────────────────────────────────────

def test_district_slug_strips_osm_rel_prefix() -> None:
    assert fc._district_slug_from_code("osm_rel_1130439") == "1130439"


def test_district_slug_passes_through_other_codes() -> None:
    assert fc._district_slug_from_code("custom_xyz") == "custom_xyz"


def test_district_slug_handles_none() -> None:
    assert fc._district_slug_from_code(None) is None


# ──────────────────────────────────────────────────────────────────────
# _validate_date
# ──────────────────────────────────────────────────────────────────────

def test_validate_date_today_ok() -> None:
    today = datetime.now(timezone.utc).date()
    fc._validate_date(today)  # no raise


def test_validate_date_yesterday_ok() -> None:
    yesterday = datetime.now(timezone.utc).date() - timedelta(days=1)
    fc._validate_date(yesterday)


def test_validate_date_too_far_past_rejected() -> None:
    far_past = datetime.now(timezone.utc).date() - timedelta(days=30)
    with pytest.raises(HTTPException) as exc:
        fc._validate_date(far_past)
    assert exc.value.status_code == 422


def test_validate_date_too_far_future_rejected() -> None:
    far_future = datetime.now(timezone.utc).date() + timedelta(days=60)
    with pytest.raises(HTTPException) as exc:
        fc._validate_date(far_future)
    assert exc.value.status_code == 422
