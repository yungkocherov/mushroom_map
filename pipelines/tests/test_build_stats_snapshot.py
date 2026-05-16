"""Offline unit tests for the stats-snapshot SQL step registry.

No DB required: we only assert the static SQL registry is well-formed
(psycopg3 `%`-safe, covers exactly the migration 042/043 tables).
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
        "stats_meta",
        "stats_forest",
        "stats_vk_timeline",
        "stats_corpus",
        "stats_weather_monthly",
    }


def test_every_step_is_psycopg3_percent_safe() -> None:
    # A lone '%' (not '%%') breaks psycopg3 conn.execute. Snapshot SQL
    # carries no params, so there must be no '%' at all.
    for table, sql in mod.SNAPSHOT_STEPS:
        assert "%" not in sql, f"{table} SQL contains '%' — psycopg3 will choke"


def test_main_is_callable() -> None:
    assert callable(mod.main)
