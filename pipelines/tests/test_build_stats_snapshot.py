"""Offline unit tests for the stats-snapshot SQL step registry.

No DB required: we only assert the static SQL registry is well-formed
(psycopg3 `%`-safe, covers exactly the snapshot tables across the
backbone + Сезонность + Лес + Погода tab migrations).
"""

from __future__ import annotations

import importlib
import sys
from pathlib import Path

import pytest

# pipelines/ scripts import sibling modules (db_utils) by being on
# sys.path[0] when run as a script; replicate that for the test.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

mod = importlib.import_module("build_stats_snapshot")


def test_steps_cover_exactly_snapshot_tables() -> None:
    tables = {table for table, _sql in mod.SNAPSHOT_STEPS}
    assert tables == {
        # backbone (migration 042)
        "stats_meta",
        "stats_forest",
        "stats_vk_timeline",
        "stats_corpus",
        # weather hub + Сезонность (043)
        "stats_weather_monthly",
        "stats_season_week",
        "stats_season_norm",
        "stats_season_species",
        # Лес tab explore tables
        "stats_forest_cross",
        "stats_forest_district",
        "stats_forest_hist",
        "stats_forest_quant",
        # Погода tab explore tables
        "stats_weather_clim",
        "stats_weather_year",
        "stats_weather_ym",
        "stats_weather_gdd",
        "stats_weather_precip_hist",
        "stats_weather_district",
        "stats_weather_district_month",
    }


def test_every_step_is_psycopg3_percent_safe() -> None:
    # A lone '%' (not '%%') breaks psycopg3 conn.execute. Snapshot SQL
    # carries no params, so there must be no '%' at all.
    for table, sql in mod.SNAPSHOT_STEPS:
        assert "%" not in sql, f"{table} SQL contains '%' — psycopg3 will choke"


def test_main_is_callable() -> None:
    assert callable(mod.main)
