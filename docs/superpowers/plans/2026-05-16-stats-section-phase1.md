# «Статистика» — Phase 1 (Backbone) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the data+API+route backbone for the Статистика section — a precomputed snapshot pipeline, four cheap read endpoints, typed client, and a lazy `/stats` route skeleton — proving the whole architecture end-to-end with real data.

**Architecture:** A Python pipeline computes aggregates over `public.*` once and writes them to `public.stats_*` snapshot tables (free-tier discipline — no heavy scans per request). FastAPI endpoints serve those tables in O(rows). The web app gets a lazy-loaded `/stats` route (Recharts bundled there only) wired to the new endpoints via the typed api-client.

**Tech Stack:** PostgreSQL/PostGIS, psycopg3, FastAPI, pytest (httpx black-box + offline `TestClient`), React 18 + react-router 7 (lazy), Recharts, TypeScript, Vite.

**Spec:** `docs/superpowers/specs/2026-05-16-stats-section-design.md`. This plan covers **Phase 1 only**. Phases 2 (hub widgets), 3 (district/species profiles + their migration `043_stats_profiles.sql`), 4 (model/corpus + Claude Design handoff) each get their own dated plan when reached. Phase 1 deliberately uses **only `public.*`** — the `forecast.*` read (weather snapshot) lands in Phase 2 so the backbone is self-contained and unblocked by the read-contract assumption.

---

## Environment (every command assumes these)

- **Worktree root (cwd for all commands):** `C:/Users/ikoch/mushroom-map/.claude/worktrees/upbeat-archimedes-da0d9c`
- **Python:** main-repo venv interpreter, run against worktree code:
  `/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe` (the worktree has no `.venv`; this is intentional — interpreter from main, code from worktree cwd).
- **DB DSN (dev):** `postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map` (port 5434, not 5432).
- **Node on PATH (before any npm/npx):** `export PATH="/c/Program Files/nodejs:$PATH"`
- **DB must be up:** `docker compose up -d db` if needed.
- **psycopg3 `%` trap:** migrate.py and the pipeline run SQL through `conn.execute(sql)`. A lone `%` anywhere in the SQL (including comments/strings) raises `incomplete placeholder`. All SQL in this plan is `%`-free by construction — keep it that way.
- **No prod deploy** anywhere in this plan. Commits land on the current worktree branch only; do not `git push`.

---

## File Structure

**Created:**
- `db/migrations/042_stats_snapshot.sql` — `public.stats_meta|stats_forest|stats_vk_timeline|stats_corpus` tables + indexes.
- `pipelines/build_stats_snapshot.py` — idempotent ETL: computes Phase-1 aggregates, writes `stats_*`. One responsibility: turn `public.*` into the snapshot.
- `pipelines/tests/test_build_stats_snapshot.py` — offline unit tests for the SQL-step registry (no DB).
- `services/api/tests/test_stats_phase1.py` — offline validation + live smoke for the four new endpoints.
- `apps/web/src/routes/stats/StatsHubPage.tsx` — page-shell skeleton, fetches `/api/stats/meta` to prove wiring.
- `apps/web/src/routes/stats/StatsHubPage.module.css` — page styles (tokens only).
- `apps/web/src/components/stats/charts/LineChart.tsx` — first Recharts wrapper, establishes the presentation-isolation contract for the Claude Design pass.

**Modified:**
- `services/api/src/api/routes/stats.py` — append four endpoints (`/meta`, `/forest`, `/vk/timeline`, `/corpus`). Existing `/overview` and `/vk/species-now` untouched.
- `packages/api-client/src/index.ts` — append inline interfaces + fetchers.
- `apps/web/src/router.tsx` — add lazy `/stats` route.
- `apps/web/src/components/layout/Header.tsx` — add `{ to: "/stats", label: "Статистика" }` to `NAV_ITEMS`.
- `apps/web/package.json` — `recharts` dependency (added by `npm install`).

---

## Task 1: Migration — `stats_*` snapshot tables

**Files:**
- Create: `db/migrations/042_stats_snapshot.sql`

- [ ] **Step 1: Write the migration**

Create `db/migrations/042_stats_snapshot.sql` with exactly this content (note: zero `%` characters — psycopg3 runs the whole file via `conn.execute`):

```sql
-- 2026-05-16: stats snapshot tables (раздел «Статистика», Phase 1).
--
-- Все агрегаты раздела считаются заранее пайплайном
-- pipelines/build_stats_snapshot.py и складываются сюда. API читает
-- только эти таблицы — никаких heavy-scan по 2.17M полигонов на
-- запрос (free-tier discipline, см. spec
-- docs/superpowers/specs/2026-05-16-stats-section-design.md).
--
-- Идемпотентность: пайплайн делает TRUNCATE + INSERT в одной
-- транзакции на таблицу. Все таблицы пересоздаются целиком каждый
-- прогон, исторических версий не храним.
--
-- Phase 1 покрывает public.* only. forecast.* (погода) и
-- profile-таблицы (stats_district_profile / stats_species_profile /
-- stats_species_season) добавит следующая миграция в своих фазах.

CREATE TABLE IF NOT EXISTS stats_meta (
    -- single-row: пайплайн делает TRUNCATE + один INSERT
    key                    TEXT PRIMARY KEY,
    generated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    forest_source_version  TEXT,
    vk_prompt_version      TEXT
);

CREATE TABLE IF NOT EXISTS stats_forest (
    -- состав леса ЛО (вся область). dimension: species | bonitet
    -- | age_group | source. key = сырое значение (slug / число /
    -- группа), label = пока = key (человеко-читаемые подписи
    -- мапятся на фронте в Phase 2).
    dimension      TEXT NOT NULL,
    bucket_key     TEXT NOT NULL,
    label          TEXT NOT NULL,
    area_km2       DOUBLE PRECISION NOT NULL DEFAULT 0,
    polygon_count  BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (dimension, bucket_key)
);

CREATE TABLE IF NOT EXISTS stats_vk_timeline (
    -- недельная активность ВК по группам видов (сырые ключи
    -- photo_species, без forecast.group). bucket = понедельник недели.
    bucket       DATE NOT NULL,
    group_key    TEXT NOT NULL,
    post_count   BIGINT NOT NULL DEFAULT 0,
    find_count   BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket, group_key)
);

CREATE INDEX IF NOT EXISTS idx_stats_vk_timeline_group
    ON stats_vk_timeline (group_key, bucket);

CREATE TABLE IF NOT EXISTS stats_corpus (
    -- гибкий key/value для здоровья пайплайна + распределения
    -- AI-классификации (в detail JSONB).
    metric      TEXT PRIMARY KEY,
    value_num   DOUBLE PRECISION,
    value_text  TEXT,
    detail      JSONB NOT NULL DEFAULT '{}'::jsonb
);
```

- [ ] **Step 2: Apply the migration**

Run (from worktree root):

```bash
/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe db/migrate.py --dsn "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map"
```

Expected output ends with: `→ 042_stats_snapshot.sql` then `Применено миграций: 1` (or `Все миграции уже применены.` on a re-run).

- [ ] **Step 3: Verify tables exist**

Run:

```bash
/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe -c "import psycopg; c=psycopg.connect('postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map'); print(sorted(r[0] for r in c.execute(\"SELECT tablename FROM pg_tables WHERE tablename LIKE 'stats_%'\").fetchall()))"
```

Expected output: `['stats_corpus', 'stats_forest', 'stats_meta', 'stats_vk_timeline']`

- [ ] **Step 4: Commit**

```bash
git add db/migrations/042_stats_snapshot.sql
git commit -m "feat(stats): миграция 042 — snapshot-таблицы stats_*"
```

---

## Task 2: Snapshot pipeline `build_stats_snapshot.py`

**Files:**
- Create: `pipelines/build_stats_snapshot.py`
- Test: `pipelines/tests/test_build_stats_snapshot.py`

- [ ] **Step 1: Write the failing test**

Create `pipelines/tests/test_build_stats_snapshot.py`:

```python
"""Offline unit tests for the stats-snapshot SQL step registry.

No DB required: we only assert the static SQL registry is well-formed
(psycopg3 `%`-safe, covers exactly the migration-042 tables).
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


def test_steps_cover_exactly_phase1_tables() -> None:
    tables = {table for table, _sql in mod.SNAPSHOT_STEPS}
    assert tables == {
        "stats_meta",
        "stats_forest",
        "stats_vk_timeline",
        "stats_corpus",
    }


def test_every_step_is_psycopg3_percent_safe() -> None:
    # A lone '%' (not '%%') breaks psycopg3 conn.execute. Snapshot SQL
    # carries no params, so there must be no '%' at all.
    for table, sql in mod.SNAPSHOT_STEPS:
        assert "%" not in sql, f"{table} SQL contains '%' — psycopg3 will choke"


def test_main_is_callable() -> None:
    assert callable(mod.main)
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe -m pytest pipelines/tests/test_build_stats_snapshot.py -q
```

Expected: FAIL — `ModuleNotFoundError: No module named 'build_stats_snapshot'`.

- [ ] **Step 3: Write the pipeline**

Create `pipelines/build_stats_snapshot.py`:

```python
"""
build_stats_snapshot: пересчитывает агрегаты раздела «Статистика» и
складывает их в public.stats_* (миграция 042). Идемпотентно — каждый
прогон делает TRUNCATE + INSERT в одной транзакции на таблицу.

Запускать после VK-ingest / forest re-ingest или по расписанию:

    python pipelines/build_stats_snapshot.py

DSN: --dsn → DATABASE_URL → POSTGRES_* → dev-дефолт (порт 5434).

Phase 1: только public.*. Тяжёлый SUM(ST_Area) по forest_unified
(~2.17M) исполняется ОДИН раз здесь (offline), не на каждый
API-запрос. forecast.* (погода) подключит Phase 2.
"""

from __future__ import annotations

import argparse
import time

import psycopg

from db_utils import resolve_dsn


# Каждый шаг: (table, sql). sql ПОЛНОСТЬЮ заменяет содержимое таблицы
# (одна INSERT ... SELECT). Никаких '%' — psycopg3 conn.execute без
# параметров парсит '%' как placeholder и падает.
_META_SQL = """
    INSERT INTO stats_meta (key, generated_at, forest_source_version, vk_prompt_version)
    SELECT
        'snapshot',
        now(),
        (SELECT source_version
           FROM forest_polygon
          GROUP BY source_version
          ORDER BY COUNT(*) DESC
          LIMIT 1),
        (SELECT photo_prompt_version
           FROM vk_post
          WHERE photo_prompt_version IS NOT NULL
          ORDER BY photo_processed_at DESC NULLS LAST
          LIMIT 1)
"""

_FOREST_SQL = """
    INSERT INTO stats_forest (dimension, bucket_key, label, area_km2, polygon_count)
    WITH base AS (
        SELECT
            dominant_species,
            source,
            meta->>'bonitet'   AS bonitet,
            meta->>'age_group' AS age_group,
            ST_Area(geometry::geography) / 1e6 AS km2
        FROM forest_unified
    ),
    species_dim AS (
        SELECT 'species' AS dimension,
               COALESCE(dominant_species, 'unknown') AS bucket_key,
               COALESCE(dominant_species, 'unknown') AS label,
               SUM(km2) AS area_km2,
               COUNT(*) AS polygon_count
        FROM base GROUP BY 1, 2, 3
    ),
    source_dim AS (
        SELECT 'source',
               COALESCE(source, 'unknown'),
               COALESCE(source, 'unknown'),
               SUM(km2), COUNT(*)
        FROM base GROUP BY 1, 2, 3
    ),
    bonitet_dim AS (
        SELECT 'bonitet',
               COALESCE(bonitet, 'unknown'),
               COALESCE(bonitet, 'unknown'),
               SUM(km2), COUNT(*)
        FROM base GROUP BY 1, 2, 3
    ),
    age_dim AS (
        SELECT 'age_group',
               COALESCE(age_group, 'unknown'),
               COALESCE(age_group, 'unknown'),
               SUM(km2), COUNT(*)
        FROM base GROUP BY 1, 2, 3
    )
    SELECT * FROM species_dim
    UNION ALL SELECT * FROM source_dim
    UNION ALL SELECT * FROM bonitet_dim
    UNION ALL SELECT * FROM age_dim
"""

_VK_TIMELINE_SQL = """
    INSERT INTO stats_vk_timeline (bucket, group_key, post_count, find_count)
    WITH posts AS (
        SELECT
            id,
            COALESCE(
                foray_date,
                (date_ts AT TIME ZONE 'Europe/Moscow')::date
            ) AS d,
            photo_species
        FROM vk_post
        WHERE photo_species IS NOT NULL
          AND jsonb_array_length(photo_species) > 0
    ),
    exploded AS (
        SELECT
            date_trunc('week', p.d)::date AS bucket,
            (s->>'species')::text         AS group_key,
            p.id                          AS post_id,
            COALESCE((s->>'count')::int, 0) AS cnt
        FROM posts p,
             LATERAL jsonb_array_elements(p.photo_species) s
        WHERE s->>'species' IS NOT NULL
          AND s->>'species' <> 'other'
          AND p.d IS NOT NULL
    )
    SELECT
        bucket,
        group_key,
        COUNT(DISTINCT post_id) AS post_count,
        SUM(cnt)                AS find_count
    FROM exploded
    GROUP BY bucket, group_key
"""

_CORPUS_SQL = """
    INSERT INTO stats_corpus (metric, value_num, value_text, detail)
    SELECT 'posts_total',
           (SELECT COUNT(*) FROM vk_post),
           NULL, '{}'::jsonb
    UNION ALL
    SELECT 'posts_classified',
           (SELECT COUNT(*) FROM vk_post WHERE photo_species IS NOT NULL),
           NULL, '{}'::jsonb
    UNION ALL
    SELECT 'forest_polygon_count',
           (SELECT COUNT(*) FROM forest_unified),
           NULL, '{}'::jsonb
    UNION ALL
    SELECT 'forest_area_km2',
           (SELECT COALESCE(SUM(ST_Area(geometry::geography)), 0) / 1e6
              FROM forest_unified),
           NULL, '{}'::jsonb
    UNION ALL
    SELECT 'forest_sources',
           NULL, NULL,
           COALESCE((
               SELECT jsonb_object_agg(source, n)
               FROM (
                   SELECT COALESCE(source, 'unknown') AS source, COUNT(*) AS n
                   FROM forest_polygon GROUP BY 1
               ) t
           ), '{}'::jsonb)
    UNION ALL
    SELECT 'classification_distribution',
           NULL, NULL,
           COALESCE((
               SELECT jsonb_agg(jsonb_build_object('species_key', sk, 'count', n)
                                ORDER BY n DESC)
               FROM (
                   SELECT (s->>'species')::text AS sk,
                          SUM(COALESCE((s->>'count')::int, 0)) AS n
                   FROM vk_post v,
                        LATERAL jsonb_array_elements(v.photo_species) s
                   WHERE v.photo_species IS NOT NULL
                     AND s->>'species' IS NOT NULL
                     AND s->>'species' <> 'other'
                   GROUP BY 1
               ) d
           ), '[]'::jsonb)
"""

SNAPSHOT_STEPS: list[tuple[str, str]] = [
    ("stats_meta", _META_SQL),
    ("stats_forest", _FOREST_SQL),
    ("stats_vk_timeline", _VK_TIMELINE_SQL),
    ("stats_corpus", _CORPUS_SQL),
]


def run(conn: psycopg.Connection) -> None:
    for table, sql in SNAPSHOT_STEPS:
        t0 = time.monotonic()
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(f"TRUNCATE {table}")
                cur.execute(sql)
                n = cur.rowcount
        print(f"  -> {table}: {n} rows in {time.monotonic() - t0:.1f}s", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser(description="Rebuild public.stats_* snapshot")
    ap.add_argument("--dsn", default=None)
    args = ap.parse_args()
    dsn = resolve_dsn(args.dsn)
    print(f"DB: {dsn[:55]}...", flush=True)
    with psycopg.connect(dsn) as conn:
        run(conn)
    print("STATS_SNAPSHOT_DONE", flush=True)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe -m pytest pipelines/tests/test_build_stats_snapshot.py -q
```

Expected: PASS (3 passed).

- [ ] **Step 5: Run the pipeline against dev DB and verify rows**

Run (from worktree root — uses worktree code via cwd):

```bash
/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe pipelines/build_stats_snapshot.py --dsn "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map"
```

Expected: four `-> stats_*: N rows in Ts` lines then `STATS_SNAPSHOT_DONE`. `stats_meta` = 1 row; `stats_forest`/`stats_vk_timeline`/`stats_corpus` > 0 rows (dev DB has data). The forest step may take 10–40s (one-time geodesic SUM over forest_unified) — expected, this is the offline cost we pay so requests stay cheap.

- [ ] **Step 6: Commit**

```bash
git add pipelines/build_stats_snapshot.py pipelines/tests/test_build_stats_snapshot.py
git commit -m "feat(stats): пайплайн build_stats_snapshot (public.* агрегаты)"
```

---

## Task 3: API endpoint `GET /api/stats/meta`

**Files:**
- Modify: `services/api/src/api/routes/stats.py` (append at end of file)
- Test: `services/api/tests/test_stats_phase1.py`

- [ ] **Step 1: Write the failing test**

Create `services/api/tests/test_stats_phase1.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe -m pytest services/api/tests/test_stats_phase1.py -q
```

Expected: FAIL — 404 (route not defined) so the `status_code == 200` assertion fails.

- [ ] **Step 3: Implement the endpoint**

Append to the end of `services/api/src/api/routes/stats.py`:

```python


# ──────────────────────────────────────────────────────────────────────────
# Статистика (Phase 1) — читает только public.stats_* (snapshot).
# Пайплайн pipelines/build_stats_snapshot.py наполняет таблицы.
# ──────────────────────────────────────────────────────────────────────────
_STATS_CACHE = "public, max-age=300, stale-while-revalidate=86400"


@router.get("/meta")
def stats_meta(response: Response) -> dict:
    """Свежесть snapshot'а + версии источников. Пустой snapshot → null'ы
    (фронт покажет «данные обновляются»), не 500."""
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT generated_at, forest_source_version, vk_prompt_version
            FROM stats_meta WHERE key = 'snapshot'
            """
        ).fetchone()
    response.headers["Cache-Control"] = _STATS_CACHE
    if row is None:
        return {
            "generated_at": None,
            "forest_source_version": None,
            "vk_prompt_version": None,
        }
    return {
        "generated_at": row[0].isoformat() if row[0] else None,
        "forest_source_version": row[1],
        "vk_prompt_version": row[2],
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe -m pytest services/api/tests/test_stats_phase1.py -q
```

Expected: PASS (1 passed).

- [ ] **Step 5: Commit**

```bash
git add services/api/src/api/routes/stats.py services/api/tests/test_stats_phase1.py
git commit -m "feat(stats): GET /api/stats/meta — свежесть snapshot"
```

---

## Task 4: API endpoint `GET /api/stats/forest`

**Files:**
- Modify: `services/api/src/api/routes/stats.py` (append)
- Modify: `services/api/tests/test_stats_phase1.py` (append tests)

- [ ] **Step 1: Write the failing tests**

Append to `services/api/tests/test_stats_phase1.py`:

```python


def test_forest_default_dimension_empty_shape(offline_client: TestClient) -> None:
    r = offline_client.get("/api/stats/forest")
    assert r.status_code == 200
    body = r.json()
    assert body == {"dimension": "species", "items": []}


def test_forest_bad_dimension_rejected(offline_client: TestClient) -> None:
    r = offline_client.get("/api/stats/forest", params={"dimension": "banana"})
    assert r.status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe -m pytest services/api/tests/test_stats_phase1.py -q
```

Expected: FAIL — the two new tests get 404.

- [ ] **Step 3: Implement the endpoint**

Append to the end of `services/api/src/api/routes/stats.py` (the `Literal` import goes at the top with the other `from typing import`; if `Optional` is already imported from typing, add `Literal` to that line — current top has `from typing import Optional`, change it to `from typing import Literal, Optional`):

```python


@router.get("/forest")
def stats_forest(
    response: Response,
    dimension: Literal["species", "bonitet", "age_group", "source"] = Query("species"),
) -> dict:
    """Состав леса ЛО по выбранному измерению. Из snapshot — дёшево."""
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT bucket_key, label, area_km2, polygon_count
            FROM stats_forest
            WHERE dimension = %s
            ORDER BY area_km2 DESC
            """,
            (dimension,),
        ).fetchall()
    response.headers["Cache-Control"] = _STATS_CACHE
    total = sum(float(r[2] or 0) for r in rows) or 1.0
    items = [
        {
            "key": r[0],
            "label": r[1],
            "area_km2": round(float(r[2] or 0), 1),
            "polygon_count": int(r[3] or 0),
            "pct": round(100.0 * float(r[2] or 0) / total, 1),
        }
        for r in rows
    ]
    return {"dimension": dimension, "items": items}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe -m pytest services/api/tests/test_stats_phase1.py -q
```

Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add services/api/src/api/routes/stats.py services/api/tests/test_stats_phase1.py
git commit -m "feat(stats): GET /api/stats/forest — состав леса по измерению"
```

---

## Task 5: API endpoint `GET /api/stats/vk/timeline`

**Files:**
- Modify: `services/api/src/api/routes/stats.py` (append)
- Modify: `services/api/tests/test_stats_phase1.py` (append tests)

- [ ] **Step 1: Write the failing tests**

Append to `services/api/tests/test_stats_phase1.py`:

```python


def test_timeline_empty_shape(offline_client: TestClient) -> None:
    r = offline_client.get("/api/stats/vk/timeline")
    assert r.status_code == 200
    body = r.json()
    assert body == {"group": "all", "items": []}


def test_timeline_limit_validation(offline_client: TestClient) -> None:
    r = offline_client.get("/api/stats/vk/timeline", params={"limit": 0})
    assert r.status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe -m pytest services/api/tests/test_stats_phase1.py -q
```

Expected: FAIL — new tests 404.

- [ ] **Step 3: Implement the endpoint**

Append to the end of `services/api/src/api/routes/stats.py`:

```python


@router.get("/vk/timeline")
def stats_vk_timeline(
    response: Response,
    group: str = Query("all", description="group_key из photo_species или 'all'"),
    limit: int = Query(1500, ge=1, le=5000),
) -> dict:
    """Недельная активность ВК по группам видов. Из snapshot.
    group='all' — все группы; иначе фильтр по одному group_key."""
    with get_conn() as conn:
        if group == "all":
            rows = conn.execute(
                """
                SELECT bucket, group_key, post_count, find_count
                FROM stats_vk_timeline
                ORDER BY bucket ASC, group_key ASC
                LIMIT %s
                """,
                (limit,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT bucket, group_key, post_count, find_count
                FROM stats_vk_timeline
                WHERE group_key = %s
                ORDER BY bucket ASC
                LIMIT %s
                """,
                (group, limit),
            ).fetchall()
    response.headers["Cache-Control"] = _STATS_CACHE
    items = [
        {
            "bucket": r[0].isoformat() if r[0] else None,
            "group_key": r[1],
            "label": SPECIES_LABELS.get(r[1], r[1]),
            "post_count": int(r[2] or 0),
            "find_count": int(r[3] or 0),
        }
        for r in rows
    ]
    return {"group": group, "items": items}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe -m pytest services/api/tests/test_stats_phase1.py -q
```

Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add services/api/src/api/routes/stats.py services/api/tests/test_stats_phase1.py
git commit -m "feat(stats): GET /api/stats/vk/timeline — недельная активность"
```

---

## Task 6: API endpoint `GET /api/stats/corpus`

**Files:**
- Modify: `services/api/src/api/routes/stats.py` (append)
- Modify: `services/api/tests/test_stats_phase1.py` (append test)

- [ ] **Step 1: Write the failing test**

Append to `services/api/tests/test_stats_phase1.py`:

```python


def test_corpus_empty_shape(offline_client: TestClient) -> None:
    r = offline_client.get("/api/stats/corpus")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"metrics", "classification", "sources"}
    assert body["metrics"] == {}
    assert body["classification"] == []
    assert body["sources"] == {}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe -m pytest services/api/tests/test_stats_phase1.py -q
```

Expected: FAIL — `/api/stats/corpus` 404.

- [ ] **Step 3: Implement the endpoint**

Append to the end of `services/api/src/api/routes/stats.py`:

```python


@router.get("/corpus")
def stats_corpus(response: Response) -> dict:
    """Здоровье корпуса/пайплайна + распределение AI-классификации.
    Из snapshot (stats_corpus key/value). Пустой → пустые контейнеры."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT metric, value_num, value_text, detail FROM stats_corpus"
        ).fetchall()
    response.headers["Cache-Control"] = _STATS_CACHE
    metrics: dict[str, object] = {}
    classification: list = []
    sources: dict = {}
    for metric, value_num, value_text, detail in rows or []:
        if metric == "classification_distribution":
            raw = detail if isinstance(detail, list) else []
            for d in raw:
                sk = d.get("species_key") or "unknown"
                classification.append({
                    "species_key": sk,
                    "label": SPECIES_LABELS.get(sk, sk),
                    "count": int(d.get("count") or 0),
                })
        elif metric == "forest_sources":
            sources = detail or {}
        else:
            metrics[metric] = (
                value_num if value_num is not None else value_text
            )
    return {"metrics": metrics, "classification": classification, "sources": sources}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe -m pytest services/api/tests/test_stats_phase1.py -q
```

Expected: PASS (6 passed).

- [ ] **Step 5: Add live smoke tests**

Append to `services/api/tests/test_stats_phase1.py`:

```python


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
```

- [ ] **Step 6: Run full stats test file**

Run:

```bash
/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe -m pytest services/api/tests/test_stats_phase1.py -q
```

Expected: 6 passed; 2 smoke either passed (if API up after Task 8) or skipped. Either is acceptable here.

- [ ] **Step 7: Commit**

```bash
git add services/api/src/api/routes/stats.py services/api/tests/test_stats_phase1.py
git commit -m "feat(stats): GET /api/stats/corpus + live smoke"
```

---

## Task 7: api-client fetchers + types

**Files:**
- Modify: `packages/api-client/src/index.ts` (append at end of file)

- [ ] **Step 1: Append interfaces + fetchers**

Append to the end of `packages/api-client/src/index.ts` (mirrors the existing ForestLegend block style — inline interfaces, plain fetch, throw on non-2xx):

```typescript


// ──────────────────────────────────────────────────────────────────────
// Статистика (Phase 1) — раздел /stats. Все читают public.stats_*.
// ──────────────────────────────────────────────────────────────────────

export interface StatsMeta {
  generated_at: string | null;
  forest_source_version: string | null;
  vk_prompt_version: string | null;
}

export type StatsForestDimension = "species" | "bonitet" | "age_group" | "source";

export interface StatsForestItem {
  key: string;
  label: string;
  area_km2: number;
  polygon_count: number;
  pct: number;
}

export interface StatsForestResponse {
  dimension: StatsForestDimension;
  items: StatsForestItem[];
}

export interface StatsTimelinePoint {
  bucket: string | null;
  group_key: string;
  label: string;
  post_count: number;
  find_count: number;
}

export interface StatsTimelineResponse {
  group: string;
  items: StatsTimelinePoint[];
}

export interface StatsCorpusResponse {
  metrics: Record<string, number | string | null>;
  classification: Array<{ species_key: string; label: string; count: number }>;
  sources: Record<string, number>;
}

export async function fetchStatsMeta(): Promise<StatsMeta> {
  const res = await fetch(`${API_BASE}/api/stats/meta`);
  if (!res.ok) throw new Error(`stats/meta ${res.status}`);
  return res.json();
}

export async function fetchStatsForest(
  dimension: StatsForestDimension = "species",
): Promise<StatsForestResponse> {
  const res = await fetch(`${API_BASE}/api/stats/forest?dimension=${dimension}`);
  if (!res.ok) throw new Error(`stats/forest ${res.status}`);
  return res.json();
}

export async function fetchStatsTimeline(
  group = "all",
  limit = 1500,
): Promise<StatsTimelineResponse> {
  const url = `${API_BASE}/api/stats/vk/timeline?group=${encodeURIComponent(group)}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`stats/timeline ${res.status}`);
  return res.json();
}

export async function fetchStatsCorpus(): Promise<StatsCorpusResponse> {
  const res = await fetch(`${API_BASE}/api/stats/corpus`);
  if (!res.ok) throw new Error(`stats/corpus ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: Typecheck the package via the web app**

Run:

```bash
export PATH="/c/Program Files/nodejs:$PATH" && cd apps/web && npx tsc --noEmit && cd ../..
```

Expected: no output (clean). The api-client is consumed source-first by the web tsconfig, so this typechecks the new exports.

- [ ] **Step 3: Commit**

```bash
git add packages/api-client/src/index.ts
git commit -m "feat(stats): api-client — fetchers + типы для /stats"
```

---

## Task 8: Recharts + chart wrapper + lazy `/stats` route + nav

**Files:**
- Modify: `apps/web/package.json` (via `npm install`)
- Create: `apps/web/src/components/stats/charts/LineChart.tsx`
- Create: `apps/web/src/routes/stats/StatsHubPage.tsx`
- Create: `apps/web/src/routes/stats/StatsHubPage.module.css`
- Modify: `apps/web/src/router.tsx`
- Modify: `apps/web/src/components/layout/Header.tsx`

- [ ] **Step 1: Install Recharts in the web workspace**

Run (from worktree root):

```bash
export PATH="/c/Program Files/nodejs:$PATH" && npm install --workspace=@mushroom-map/web recharts
```

Expected: `recharts` appears under `dependencies` in `apps/web/package.json`; `node_modules` updated; no error.

- [ ] **Step 2: Create the chart wrapper (presentation-isolation contract)**

Create `apps/web/src/components/stats/charts/LineChart.tsx`. This is the contract for the Claude Design pass — colors come only from CSS vars, the consumer passes plain data:

```tsx
/**
 * LineChart — тонкая обёртка над Recharts. ЕДИНСТВЕННОЕ место, где
 * раздел «Статистика» знает про Recharts. Цвета — только из CSS-vars
 * (--forest и т.д.), чтобы Claude Design проход переодевал график без
 * правок логики виджетов.
 */
import {
  ResponsiveContainer,
  LineChart as RLineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export interface LineChartProps {
  data: Array<Record<string, number | string | null>>;
  xKey: string;
  yKey: string;
  height?: number;
}

export function LineChart({ data, xKey, yKey, height = 240 }: LineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RLineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke="var(--rule)" strokeDasharray="3 3" />
        <XAxis dataKey={xKey} stroke="var(--ink-faint)" fontSize={11} />
        <YAxis stroke="var(--ink-faint)" fontSize={11} />
        <Tooltip
          contentStyle={{
            background: "var(--paper-rise)",
            border: "1px solid var(--rule)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Line
          type="monotone"
          dataKey={yKey}
          stroke="var(--forest)"
          strokeWidth={2}
          dot={false}
        />
      </RLineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Create the page-shell skeleton**

Create `apps/web/src/routes/stats/StatsHubPage.module.css`:

```css
.header {
  margin-bottom: var(--space-5);
}

.eyebrow {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--moss);
  margin: 0 0 var(--space-2);
}

.freshness {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--ink-faint);
  margin-top: var(--space-4);
}
```

Create `apps/web/src/routes/stats/StatsHubPage.tsx` (page-shell exactly like SpeciesListPage: Container + eyebrow + prose.h1 + prose.lead + usePageTitle; fetches `/api/stats/meta` to prove the backbone is wired):

```tsx
/**
 * /stats — хаб раздела «Статистика». Phase 1: скелет на page-shell,
 * тянет /api/stats/meta чтобы подтвердить, что backbone подключён.
 * Виджеты (KPI, сезонный пульс, лес в цифрах) — Phase 2.
 */
import { useEffect, useState } from "react";
import { fetchStatsMeta, type StatsMeta } from "@mushroom-map/api-client";
import { Container } from "../../components/layout/Container";
import { usePageTitle } from "../../lib/usePageTitle";
import styles from "./StatsHubPage.module.css";
import prose from "../Prose.module.css";

export function StatsHubPage() {
  usePageTitle(
    "Статистика — Geobiom",
    "Интерактивная статистика по лесам, грибным находкам и данным проекта Geobiom.",
  );

  const [meta, setMeta] = useState<StatsMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStatsMeta()
      .then((m) => !cancelled && setMeta(m))
      .catch((e) => !cancelled && setError(e.message ?? "Ошибка загрузки"));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Container as="section" size="wide">
      <header className={styles.header}>
        <p className={styles.eyebrow}>Данные проекта</p>
        <h1 className={prose.h1}>Статистика</h1>
        <p className={prose.lead}>
          Лес, грибные находки, погода и AI-классификация Ленобласти —
          интерактивно. Раздел наполняется; виджеты и профили районов и
          видов появятся в следующих итерациях.
        </p>
        {error && (
          <p className={prose.p} style={{ color: "var(--danger)" }}>
            Не удалось загрузить метаданные: {error}
          </p>
        )}
        {meta && (
          <p className={styles.freshness}>
            {meta.generated_at
              ? `данные на ${new Date(meta.generated_at).toLocaleDateString("ru-RU")}`
              : "snapshot ещё не сформирован"}
          </p>
        )}
      </header>
    </Container>
  );
}
```

- [ ] **Step 4: Add the lazy route**

In `apps/web/src/router.tsx`, add the lazy import next to the existing `MapPage` lazy declaration (after line 49, the closing `);` of the `MapPage` lazy):

```tsx
const StatsHubPage = lazy(() =>
  import("./routes/stats/StatsHubPage").then((m) => ({ default: m.StatsHubPage })),
);
```

Then add this child route immediately after the `{ path: "species/:slug", element: <SpeciesDetailPage /> },` line (line 107):

```tsx
      {
        path: "stats",
        element: (
          <Suspense fallback={<MapPageLoader />}>
            <StatsHubPage />
          </Suspense>
        ),
      },
```

(`MapPageLoader` and `Suspense` are already imported/defined in this file — reuse them; the loader's "Загружаем карту…" text is acceptable as a generic Phase-1 fallback and gets a stats-specific loader in Phase 2.)

- [ ] **Step 5: Add the nav item**

In `apps/web/src/components/layout/Header.tsx`, change the `NAV_ITEMS` array (lines 13–19) by adding one entry after the `methodology` line:

```tsx
const NAV_ITEMS: Array<{ to: string; label: string; primary?: boolean }> = [
  { to: "/map",         label: "Карта", primary: true },
  { to: "/species",     label: "Виды" },
  { to: "/spots",       label: "Мои места" },
  { to: "/calendar",    label: "Календарь" },
  { to: "/methodology", label: "Методология" },
  { to: "/stats",       label: "Статистика" },
];
```

- [ ] **Step 6: Typecheck + build**

Run:

```bash
export PATH="/c/Program Files/nodejs:$PATH" && cd apps/web && npx tsc --noEmit && npm run build && cd ../..
```

Expected: `tsc` clean (no output); `vite build` succeeds. Recharts must NOT be in the main/index chunk — confirm the build output lists a separate lazy chunk for `StatsHubPage` (Vite names it from the dynamic import). If `recharts` lands in the entry chunk, the lazy import is wrong — fix before committing.

- [ ] **Step 7: Visual self-check (CLAUDE.md mandatory after web changes)**

Start the API + web dev server, then verify `/stats` renders via Claude Preview (per the `verify-ui-via-claude-preview` project skill):

```bash
docker compose --profile full up -d
export PATH="/c/Program Files/nodejs:$PATH" && npm run dev
```

Then load `http://localhost:5173/stats` in Claude Preview: confirm the header renders (eyebrow «Данные проекта», H1 «Статистика», lead), the nav shows «Статистика», and the freshness line shows either `данные на <date>` (if Task 2 pipeline ran) or «snapshot ещё не сформирован» — and there is **no** console error and **no** `tsc`/network 500. Screenshot it. Do not claim done without the screenshot (CLAUDE.md visual-verify rule).

- [ ] **Step 8: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/src/components/stats/charts/LineChart.tsx apps/web/src/routes/stats/StatsHubPage.tsx apps/web/src/routes/stats/StatsHubPage.module.css apps/web/src/router.tsx apps/web/src/components/layout/Header.tsx
git commit -m "feat(stats): lazy /stats route-skeleton + nav + Recharts wrapper"
```

(If `package-lock.json` lives at repo root instead of `apps/web/`, add the root one — check `git status` and stage the lockfile that actually changed.)

---

## Task 9: Phase-1 regression gate

**Files:** none (verification only)

- [ ] **Step 1: Full backend test suite (no regressions)**

Run:

```bash
/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe -m pytest -q
```

Expected: all prior tests still pass; new `test_build_stats_snapshot.py` (3) and `test_stats_phase1.py` (6 + smoke) green or smoke-skipped. No failures, no errors.

- [ ] **Step 2: Confirm endpoints serve real snapshot data**

With the API up (Task 8 step 7) and the snapshot built (Task 2 step 5), run:

```bash
/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe -c "import httpx; c=httpx.Client(base_url='http://localhost:8000', timeout=10); [print(p, c.get(p).status_code, str(c.get(p).json())[:120]) for p in ['/api/stats/meta','/api/stats/forest?dimension=species','/api/stats/vk/timeline?group=all&limit=5','/api/stats/corpus']]"
```

Expected: each line `200` with non-empty JSON (meta has a `generated_at` timestamp; forest items non-empty; timeline items present; corpus metrics populated).

- [ ] **Step 3: Final Phase-1 commit marker**

```bash
git commit --allow-empty -m "chore(stats): Phase 1 backbone complete — snapshot+API+route skeleton"
```

---

## Phases 2–4 (roadmap — each gets its own dated plan)

- **Phase 2 — Overview hub.** KPI strip, «Сезонный пульс» (uses `/api/stats/vk/timeline`), «Сейчас собирают» (existing `/api/stats/vk/species-now`), «Лес ЛО в цифрах» (`/api/stats/forest`), mini-leaderboards, weather snapshot. **Phase 2 adds the `forecast.*` read** to the snapshot pipeline (weather summaries) guarded by `to_regclass('forecast.weather_daily')` — and records the widened read-contract in CLAUDE.md + memory at that point. Recharts widgets behind `components/stats/charts/*`.
- **Phase 3 — Profiles.** Migration `043_stats_profiles.sql` (`stats_district_profile`, `stats_species_profile`, `stats_species_season`); pipeline extends with per-district/per-species aggregates + co-occurrence; `/stats/districts`, `/stats/districts/:slug`, `/stats/species`, `/stats/species/:slug`; compare drawer.
- **Phase 4 — Model/Corpus + handoff.** `/stats/model` (static import of sister-repo `reports/` JSON, preview badge), `/stats/data`; componentization audit; `docs/stats-design-handoff.md` (tokens/component contract for the Claude Design pass).

---

## Self-Review

**1. Spec coverage (Phase 1 scope):**
- Snapshot ETL + `public.stats_*` (spec decision #3) → Tasks 1–2. ✔
- Cheap read endpoints from snapshot (spec API section) → Tasks 3–6. ✔
- Recharts behind local wrappers (spec decision #5, handoff contract) → Task 8 step 2. ✔
- Lazy `/stats` route + nav (spec frontend) → Task 8. ✔
- Free-tier discipline (no per-request heavy scans) → heavy SUM only in offline Task 2; endpoints O(rows). ✔
- `forecast.*` deferred to Phase 2 — explicitly scoped so Phase 1 is unblocked by the read-contract assumption (spec risk section). ✔ Roadmap carries it forward. ✔
- No prod deploy (spec decision #6) → stated in env block; only branch commits. ✔

**2. Placeholder scan:** No "TBD/TODO/handle errors" — every code step has complete content. `label = key` in `stats_forest` is a deliberate, documented Phase-1 simplification (human labels are a Phase-2 frontend concern), not a placeholder. The package-lock staging note in Task 8 step 8 is a real conditional, not a placeholder.

**3. Type/name consistency:** `SNAPSHOT_STEPS` (Task 2) ↔ test (Task 2) match. Table names `stats_meta/stats_forest/stats_vk_timeline/stats_corpus` consistent across migration (Task 1), pipeline (Task 2), endpoints (Tasks 3–6). `_STATS_CACHE` defined in Task 3, reused Tasks 4–6 (Task 3 must land first — task order enforces this). `SPECIES_LABELS` is pre-existing in `stats.py` (verified) — reused in Tasks 5–6. api-client types (`StatsMeta/StatsForestResponse/StatsTimelineResponse/StatsCorpusResponse`, Task 7) match endpoint JSON shapes (Tasks 3–6) and the `StatsMeta` import in `StatsHubPage.tsx` (Task 8). `Literal` import fix called out explicitly in Task 4 (current `stats.py` imports only `Optional` from typing).

No issues outstanding.
