# Лес (Forest) Stats Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the «Лес» tab of /stats — 17 charts over ФГИСЛК forest data (1.25M polygons, 47k km², ЛО), grouped in 4 sections, on the precomputed-snapshot architecture.

**Architecture:** Heavy `ST_Area`/`ST_Contains` aggregation runs ONCE offline in `pipelines/build_stats_snapshot.py` into new `public.stats_forest_*` tables (migration 045). One thin O(rows) endpoint `/api/stats/forest/explore` returns the whole forest snapshot (~250 rows). Frontend `ForestTab.tsx` slices it; pure transforms are unit-tested; Recharts stays isolated in chart wrappers; all colour/size via CSS-var tokens (Claude Design pass re-skins without touching logic).

**Tech Stack:** PostgreSQL/PostGIS, psycopg3, FastAPI, React + TypeScript, Recharts (isolated), vitest.

**Data facts (from `docs/superpowers/notes/2026-05-16-forest-data-audit.md`):** source=`rosleshoz` only; species birch/pine/spruce/aspen/alder = 99.9% area + negligible tail→`other`; bonitet ordinal 1–5 (1=best); age 5 clean classes + junk→`не определён`; timber_stock m³/ha p25=120 med=195 p75=250 max=840; 99.9% polygons map to 18 districts; `species_composition` 100% monoculture (no mix charts); `canopy_cover` 0% (dead); NO time dimension (no trends). **All aggregates area-weighted** (geodesic `ST_Area(geometry::geography)`), except per-polygon distribution quantiles (idea 3/7/8) where the polygon is the unit.

**psycopg3 trap:** snapshot SQL is run via `cur.execute(sql)` with NO params → it must contain ZERO `%` characters (psycopg3 parses `%` as a placeholder even in comments/strings). Endpoint SQL uses real `%s` + a params tuple. Cyrillic string literals in SQL are fine (UTF-8 to the DB); only Python `print()` must stay ASCII (Windows cp1251).

---

## Chart → wrapper mapping (final)

| Ideas | Wrapper | Notes |
|---|---|---|
| 1,2,4,5,9,11,14,15,16 | `BarChart` (exists, horizontal single-series) | ranking / distribution / histogram |
| 3,7,8 | `RangeBars` (exists) | IQR box: start=p25, end=p75, mark=p50 |
| 6,12 | `Heatmap` (exists) | species×bonitet, age×bonitet |
| 10,13,17 | **`StackedBarChart` (NEW, Task 7)** | 100%-stacked horizontal bar |

The 17 ideas, by section (titles are the card `<h3>`):

- **Состав леса:** (1) Породный состав ЛО (2) Средний размер выдела по породам (3) Размер выдела по породам — распределение
- **Качество и продуктивность:** (4) Распределение по бонитету (5) Запас древесины (м³/га) (6) Бонитет × порода (7) Запас по породам (8) Бонитет → запас (валидация)
- **Возрастная структура:** (9) Возрастная структура ЛО (10) Возраст × порода (11) Доля спелых+перестойных по породам (12) Возраст × бонитет
- **География:** (13) Породный состав по районам (14) Лесистость районов (15) Средний бонитет/запас по районам (16) «Грибной» профиль района (17) Возрастная структура по районам

---

## File Structure

- Create `db/migrations/045_stats_forest.sql` — 4 tables (`stats_forest_quant`, `stats_forest_cross`, `stats_forest_hist`, `stats_forest_district`). Reuse existing `stats_forest` (dimension-keyed) for 1-D species/bonitet/age (ideas 1,2,4,9 derive from it).
- Modify `pipelines/build_stats_snapshot.py` — add 4 SQL constants + 4 `SNAPSHOT_STEPS` entries.
- Modify `services/api/src/api/routes/stats.py` — add `GET /api/stats/forest/explore`.
- Modify `packages/api-client/src/index.ts` — `ForestExploreResponse` + `fetchForestExplore()`.
- Create `apps/web/src/components/stats/forest/transforms.ts` + `transforms.test.ts` — pure slicing/folding/derivation.
- Create `apps/web/src/components/stats/charts/StackedBarChart.tsx` — new isolated wrapper.
- Create `apps/web/src/routes/stats/ForestTab.tsx` + `apps/web/src/components/stats/forest/ForestCharts.module.css`.
- Modify `apps/web/src/routes/stats/StatsTabs.tsx` — wire `active === "forest"`.

Reference pattern (read, do not duplicate): `apps/web/src/routes/stats/SeasonalityTab.tsx` (card grid + section layout + loading/empty state + pill selectors) and `apps/web/src/components/stats/season/SeasonCharts.module.css`.

---

### Task 1: Migration 045 — forest snapshot tables

**Files:**
- Create: `db/migrations/045_stats_forest.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 2026-05-17: forest stats snapshot (раздел «Статистика», вкладка
-- «Лес»). Наполняется pipelines/build_stats_snapshot.py из
-- forest_polygon (source='rosleshoz') + admin_area (level=6).
-- Только public.*. Все площади geodesic (ST_Area::geography).
-- Аудит данных: docs/superpowers/notes/2026-05-16-forest-data-audit.md

-- Перцентили per-polygon метрики по группе (box: p25/p50/p75 +
-- усы p10/p90). Единица — выдел, НЕ площадь-вес (idea 3/7/8).
CREATE TABLE IF NOT EXISTS stats_forest_quant (
    group_kind  TEXT NOT NULL,            -- 'species' | 'bonitet'
    group_key   TEXT NOT NULL,
    metric      TEXT NOT NULL,            -- 'area_ha' | 'stock'
    n           BIGINT NOT NULL DEFAULT 0,
    p10 DOUBLE PRECISION, p25 DOUBLE PRECISION, p50 DOUBLE PRECISION,
    p75 DOUBLE PRECISION, p90 DOUBLE PRECISION,
    PRIMARY KEY (group_kind, group_key, metric)
);

-- 2-мерный кросс (площадь-взвешенный км²). Покрывает species×bonitet,
-- species×age, age×bonitet, district×species, district×age.
CREATE TABLE IF NOT EXISTS stats_forest_cross (
    dim_a   TEXT NOT NULL,
    key_a   TEXT NOT NULL,
    dim_b   TEXT NOT NULL,
    key_b   TEXT NOT NULL,
    area_km2      DOUBLE PRECISION NOT NULL DEFAULT 0,
    polygon_count BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (dim_a, key_a, dim_b, key_b)
);

-- Гистограмма запаса древесины (площадь-взвешенная), 20 м³/га бины.
CREATE TABLE IF NOT EXISTS stats_forest_hist (
    metric        TEXT NOT NULL,          -- 'stock'
    bin_lo        DOUBLE PRECISION NOT NULL,
    bin_hi        DOUBLE PRECISION NOT NULL,
    area_km2      DOUBLE PRECISION NOT NULL DEFAULT 0,
    polygon_count BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (metric, bin_lo)
);

-- Сводка по 18 районам ЛО.
CREATE TABLE IF NOT EXISTS stats_forest_district (
    district_id    INTEGER PRIMARY KEY,
    district_name  TEXT NOT NULL,
    land_km2       DOUBLE PRECISION NOT NULL DEFAULT 0,
    forest_km2     DOUBLE PRECISION NOT NULL DEFAULT 0,
    forest_pct     DOUBLE PRECISION NOT NULL DEFAULT 0,
    mean_bonitet   DOUBLE PRECISION,
    mean_stock     DOUBLE PRECISION,
    mature_host_pct DOUBLE PRECISION   -- доля спелых+перестойных pine/spruce/birch
);
```

- [ ] **Step 2: Apply the migration**

Run: `cd "/c/Users/ikoch/mushroom-map/.claude/worktrees/upbeat-archimedes-da0d9c" && .venv/Scripts/python.exe db/migrate.py`
Expected: applies `045_stats_forest.sql`, no error. (venv path note: repo root `.venv` is at `/c/Users/ikoch/mushroom-map/.venv`; `db/migrate.py` resolves DSN to port 5434.)

- [ ] **Step 3: Verify tables exist**

Run: `.venv/Scripts/python.exe -c "import psycopg;c=psycopg.connect('postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map');print([r[0] for r in c.execute(\"select table_name from information_schema.tables where table_name like 'stats_forest%'\").fetchall()])"`
Expected: includes `stats_forest`, `stats_forest_quant`, `stats_forest_cross`, `stats_forest_hist`, `stats_forest_district`.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/045_stats_forest.sql
git commit -m "feat(stats): миграция 045 — forest snapshot таблицы (Лес tab)"
```

---

### Task 2: Pipeline SQL — 4 forest snapshot steps

**Files:**
- Modify: `pipelines/build_stats_snapshot.py` (add 4 SQL constants before `SNAPSHOT_STEPS`; add 4 tuples to `SNAPSHOT_STEPS` after `("stats_season_species", _SEASON_SPECIES_SQL)`)

Age-fold expression (used in cross + district), call it `AGE_CASE`:
```
CASE forest_polygon.meta->>'age_group'
  WHEN 'молодняки' THEN 'молодняки'
  WHEN 'средневозрастные' THEN 'средневозрастные'
  WHEN 'приспевающие' THEN 'приспевающие'
  WHEN 'спелые' THEN 'спелые'
  WHEN 'перестойные' THEN 'перестойные'
  ELSE 'не определён' END
```

- [ ] **Step 1: Add `_FOREST_QUANT_SQL`**

```python
_FOREST_QUANT_SQL = """
    INSERT INTO stats_forest_quant
      (group_kind, group_key, metric, n, p10, p25, p50, p75, p90)
    WITH base AS (
        SELECT dominant_species AS sp,
               meta->>'bonitet'  AS bon,
               area_m2 / 1e4      AS area_ha,
               CASE WHEN (meta->>'timber_stock') ~ '^[0-9]+(\\.[0-9]+)?$'
                    THEN (meta->>'timber_stock')::numeric END AS stock
        FROM forest_polygon
        WHERE source = 'rosleshoz'
    ),
    q AS (
        SELECT 'species' AS gk, sp AS g, 'area_ha' AS m, area_ha AS v
        FROM base WHERE sp IS NOT NULL
        UNION ALL
        SELECT 'species', sp, 'stock', stock
        FROM base WHERE sp IS NOT NULL AND stock IS NOT NULL
        UNION ALL
        SELECT 'bonitet', bon, 'stock', stock
        FROM base WHERE bon ~ '^[0-9]+$' AND stock IS NOT NULL
    )
    SELECT gk, g, m, count(*),
           percentile_cont(0.10) WITHIN GROUP (ORDER BY v),
           percentile_cont(0.25) WITHIN GROUP (ORDER BY v),
           percentile_cont(0.50) WITHIN GROUP (ORDER BY v),
           percentile_cont(0.75) WITHIN GROUP (ORDER BY v),
           percentile_cont(0.90) WITHIN GROUP (ORDER BY v)
    FROM q GROUP BY gk, g, m
"""
```

- [ ] **Step 2: Add `_FOREST_CROSS_SQL`**

```python
_FOREST_CROSS_SQL = """
    INSERT INTO stats_forest_cross
      (dim_a, key_a, dim_b, key_b, area_km2, polygon_count)
    WITH base AS (
        SELECT dominant_species AS sp,
               NULLIF(meta->>'bonitet', '') AS bon,
               CASE meta->>'age_group'
                 WHEN 'молодняки' THEN 'молодняки'
                 WHEN 'средневозрастные' THEN 'средневозрастные'
                 WHEN 'приспевающие' THEN 'приспевающие'
                 WHEN 'спелые' THEN 'спелые'
                 WHEN 'перестойные' THEN 'перестойные'
                 ELSE 'не определён' END AS age,
               ST_Area(geometry::geography) / 1e6 AS km2,
               ST_Centroid(geometry) AS c
        FROM forest_polygon
        WHERE source = 'rosleshoz'
    ),
    withd AS (
        SELECT b.sp, b.bon, b.age, b.km2, aa.id AS did
        FROM base b
        LEFT JOIN admin_area aa
          ON aa.level = 6
         AND aa.geometry && b.c
         AND ST_Contains(aa.geometry, b.c)
    )
    SELECT 'species', sp, 'bonitet', bon, SUM(km2), COUNT(*)
    FROM withd WHERE sp IS NOT NULL AND bon IS NOT NULL GROUP BY sp, bon
    UNION ALL
    SELECT 'species', sp, 'age', age, SUM(km2), COUNT(*)
    FROM withd WHERE sp IS NOT NULL GROUP BY sp, age
    UNION ALL
    SELECT 'age', age, 'bonitet', bon, SUM(km2), COUNT(*)
    FROM withd WHERE bon IS NOT NULL GROUP BY age, bon
    UNION ALL
    SELECT 'district', did::text, 'species', sp, SUM(km2), COUNT(*)
    FROM withd WHERE did IS NOT NULL AND sp IS NOT NULL GROUP BY did, sp
    UNION ALL
    SELECT 'district', did::text, 'age', age, SUM(km2), COUNT(*)
    FROM withd WHERE did IS NOT NULL GROUP BY did, age
"""
```

- [ ] **Step 3: Add `_FOREST_HIST_SQL`**

```python
_FOREST_HIST_SQL = """
    INSERT INTO stats_forest_hist
      (metric, bin_lo, bin_hi, area_km2, polygon_count)
    WITH s AS (
        SELECT CASE WHEN (meta->>'timber_stock') ~ '^[0-9]+(\\.[0-9]+)?$'
                    THEN (meta->>'timber_stock')::numeric END AS stock,
               ST_Area(geometry::geography) / 1e6 AS km2
        FROM forest_polygon
        WHERE source = 'rosleshoz'
    ),
    b AS (
        SELECT LEAST(floor(stock / 20.0), 30) AS bk, km2
        FROM s WHERE stock IS NOT NULL
    )
    SELECT 'stock', bk * 20.0, bk * 20.0 + 20.0, SUM(km2), COUNT(*)
    FROM b GROUP BY bk ORDER BY bk
"""
```

- [ ] **Step 4: Add `_FOREST_DISTRICT_SQL`**

```python
_FOREST_DISTRICT_SQL = """
    INSERT INTO stats_forest_district
      (district_id, district_name, land_km2, forest_km2, forest_pct,
       mean_bonitet, mean_stock, mature_host_pct)
    WITH land AS (
        SELECT id, name,
               ST_Area(geometry::geography) / 1e6 AS land_km2
        FROM admin_area WHERE level = 6
    ),
    fp AS (
        SELECT aa.id AS did,
               ST_Area(p.geometry::geography) / 1e6 AS km2,
               CASE WHEN (p.meta->>'bonitet') ~ '^[0-9]+$'
                    THEN (p.meta->>'bonitet')::numeric END AS bon,
               CASE WHEN (p.meta->>'timber_stock') ~ '^[0-9]+(\\.[0-9]+)?$'
                    THEN (p.meta->>'timber_stock')::numeric END AS stock,
               p.meta->>'age_group' AS age,
               p.dominant_species AS sp
        FROM forest_polygon p
        JOIN admin_area aa
          ON aa.level = 6
         AND aa.geometry && ST_Centroid(p.geometry)
         AND ST_Contains(aa.geometry, ST_Centroid(p.geometry))
        WHERE p.source = 'rosleshoz'
    ),
    agg AS (
        SELECT did,
               SUM(km2) AS forest_km2,
               SUM(km2) FILTER (WHERE bon IS NOT NULL) AS km2_bon,
               SUM(km2 * bon) FILTER (WHERE bon IS NOT NULL) AS bon_w,
               SUM(km2) FILTER (WHERE stock IS NOT NULL) AS km2_stk,
               SUM(km2 * stock) FILTER (WHERE stock IS NOT NULL) AS stk_w,
               SUM(km2) FILTER (
                 WHERE age IN ('спелые', 'перестойные')
                   AND sp IN ('pine', 'spruce', 'birch')) AS mature_host
        FROM fp GROUP BY did
    )
    SELECT l.id, l.name,
           ROUND(l.land_km2::numeric, 1),
           ROUND(COALESCE(a.forest_km2, 0)::numeric, 1),
           ROUND((100 * COALESCE(a.forest_km2, 0)
                  / NULLIF(l.land_km2, 0))::numeric, 1),
           ROUND((a.bon_w / NULLIF(a.km2_bon, 0))::numeric, 2),
           ROUND((a.stk_w / NULLIF(a.km2_stk, 0))::numeric, 1),
           ROUND((100 * COALESCE(a.mature_host, 0)
                  / NULLIF(a.forest_km2, 0))::numeric, 1)
    FROM land l LEFT JOIN agg a ON a.did = l.id
"""
```

- [ ] **Step 5: Register the 4 steps**

In `SNAPSHOT_STEPS`, append after `("stats_season_species", _SEASON_SPECIES_SQL),`:

```python
    ("stats_forest_quant", _FOREST_QUANT_SQL),
    ("stats_forest_cross", _FOREST_CROSS_SQL),
    ("stats_forest_hist", _FOREST_HIST_SQL),
    ("stats_forest_district", _FOREST_DISTRICT_SQL),
```

- [ ] **Step 6: Grep-guard — zero `%` in the new SQL**

Run: `grep -n "%" pipelines/build_stats_snapshot.py | grep -iE "FOREST_(QUANT|CROSS|HIST|DISTRICT)" || echo "NO_PERCENT_OK"`
Expected: `NO_PERCENT_OK` (the constants contain no `%`). If any line prints, remove/escape the `%` before running the pipeline.

- [ ] **Step 7: Commit**

```bash
git add pipelines/build_stats_snapshot.py
git commit -m "feat(stats): pipeline — 4 forest snapshot шага (quant/cross/hist/district)"
```

---

### Task 3: Run pipeline + sanity-check vs audit

**Files:** none (execution + verification only)

- [ ] **Step 1: Run the snapshot builder**

Run: `cd "/c/Users/ikoch/mushroom-map/.claude/worktrees/upbeat-archimedes-da0d9c" && PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe pipelines/build_stats_snapshot.py`
Expected: prints `-> stats_forest_quant: N rows`, `-> stats_forest_cross: N rows`, `-> stats_forest_hist: N rows`, `-> stats_forest_district: 18 rows` with no exception. (district join over 1.25M polygons may take a few minutes — acceptable, offline.)

- [ ] **Step 2: Sanity-check the numbers against the audit**

Run this script (write to `C:/tmp/_forest_sane.py`, then run with the venv python):

```python
import psycopg
c = psycopg.connect("postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map")
print("district rows:", c.execute("select count(*) from stats_forest_district").fetchone()[0])
print("forest_km2 sum:", c.execute("select round(sum(forest_km2)::numeric,0) from stats_forest_district").fetchone()[0])
print("species area km2 (cross species x bonitet):",
      c.execute("select key_a, round(sum(area_km2)::numeric,0) from stats_forest_cross where dim_a='species' and dim_b='bonitet' group by key_a order by 2 desc").fetchall())
print("stock p50 by species:",
      c.execute("select group_key, p50 from stats_forest_quant where group_kind='species' and metric='stock' order by p50 desc").fetchall())
print("hist bins:", c.execute("select count(*) from stats_forest_hist").fetchone()[0])
c.close()
```

Expected (must roughly match the audit note): total forest ≈ 40–47k km²; pine/birch/spruce each ≈ 12–15k km²; stock p50 around 150–230 by species; ≈ 18 district rows; ≈ 30–32 hist bins. If a number is wildly off (e.g. species area 4× inflated → Web-Mercator bug; district count ≠ 18; all stock NULL → regex wrong), STOP and fix the SQL in Task 2 before continuing — do not paper over with frontend logic.

- [ ] **Step 3: No commit** (no file changes; this is a verification gate).

---

### Task 4: API endpoint `/api/stats/forest/explore`

**Files:**
- Modify: `services/api/src/api/routes/stats.py` (add after `stats_season_species`, before any non-stats router code; reuse existing `get_conn`, `_STATS_CACHE`)

- [ ] **Step 1: Add the endpoint**

```python
@router.get("/forest/explore")
def stats_forest_explore(response: Response) -> dict:
    """Весь forest-snapshot одним ответом (~250 строк): dim (reuse
    stats_forest) + quant + cross + hist + district. Фронт нарезает.
    Из snapshot (миграция 045 + pipelines/build_stats_snapshot.py)."""
    with get_conn() as conn:
        dim = conn.execute(
            "SELECT dimension, bucket_key, label, area_km2, polygon_count "
            "FROM stats_forest "
            "WHERE dimension IN ('species','bonitet','age_group') "
            "ORDER BY dimension, area_km2 DESC"
        ).fetchall()
        quant = conn.execute(
            "SELECT group_kind, group_key, metric, n, p10, p25, p50, p75, p90 "
            "FROM stats_forest_quant"
        ).fetchall()
        cross = conn.execute(
            "SELECT dim_a, key_a, dim_b, key_b, area_km2, polygon_count "
            "FROM stats_forest_cross"
        ).fetchall()
        hist = conn.execute(
            "SELECT metric, bin_lo, bin_hi, area_km2, polygon_count "
            "FROM stats_forest_hist ORDER BY metric, bin_lo"
        ).fetchall()
        dist = conn.execute(
            "SELECT district_id, district_name, land_km2, forest_km2, "
            "forest_pct, mean_bonitet, mean_stock, mature_host_pct "
            "FROM stats_forest_district ORDER BY forest_km2 DESC"
        ).fetchall()
    response.headers["Cache-Control"] = _STATS_CACHE

    def f(x):
        return None if x is None else float(x)

    return {
        "dim": [
            {"dimension": d[0], "key": d[1], "label": d[2],
             "area_km2": f(d[3]), "polygon_count": int(d[4])}
            for d in dim or []
        ],
        "quant": [
            {"group_kind": q[0], "group_key": q[1], "metric": q[2],
             "n": int(q[3]), "p10": f(q[4]), "p25": f(q[5]),
             "p50": f(q[6]), "p75": f(q[7]), "p90": f(q[8])}
            for q in quant or []
        ],
        "cross": [
            {"dim_a": x[0], "key_a": x[1], "dim_b": x[2], "key_b": x[3],
             "area_km2": f(x[4]), "polygon_count": int(x[5])}
            for x in cross or []
        ],
        "hist": [
            {"metric": h[0], "bin_lo": f(h[1]), "bin_hi": f(h[2]),
             "area_km2": f(h[3]), "polygon_count": int(h[4])}
            for h in hist or []
        ],
        "district": [
            {"district_id": int(r[0]), "district_name": r[1],
             "land_km2": f(r[2]), "forest_km2": f(r[3]),
             "forest_pct": f(r[4]), "mean_bonitet": f(r[5]),
             "mean_stock": f(r[6]), "mature_host_pct": f(r[7])}
            for r in dist or []
        ],
    }
```

- [ ] **Step 2: Verify endpoint live**

The worktree API runs on :8000 with `--reload`. Run:
`curl -s "http://localhost:8000/api/stats/forest/explore" | .venv/Scripts/python.exe -c "import sys,json;d=json.load(sys.stdin);print({k:len(v) for k,v in d.items()})"`
Expected: dict like `{'dim': ~15, 'quant': ~15, 'cross': ~150, 'hist': ~31, 'district': 18}`. If 500 → `docker compose logs --tail 50 api` (CORS-in-browser is really a server exception).

- [ ] **Step 3: Commit**

```bash
git add services/api/src/api/routes/stats.py
git commit -m "feat(stats): endpoint /api/stats/forest/explore (весь forest-snapshot)"
```

---

### Task 5: api-client interface + fetcher

**Files:**
- Modify: `packages/api-client/src/index.ts` (add near the Season interfaces ~line 428–448; reuse `API_BASE`)

- [ ] **Step 1: Add types + fetcher**

```typescript
export interface ForestDimRow { dimension: string; key: string; label: string; area_km2: number | null; polygon_count: number; }
export interface ForestQuantRow { group_kind: string; group_key: string; metric: string; n: number; p10: number | null; p25: number | null; p50: number | null; p75: number | null; p90: number | null; }
export interface ForestCrossRow { dim_a: string; key_a: string; dim_b: string; key_b: string; area_km2: number | null; polygon_count: number; }
export interface ForestHistRow { metric: string; bin_lo: number | null; bin_hi: number | null; area_km2: number | null; polygon_count: number; }
export interface ForestDistrictRow { district_id: number; district_name: string; land_km2: number | null; forest_km2: number | null; forest_pct: number | null; mean_bonitet: number | null; mean_stock: number | null; mature_host_pct: number | null; }
export interface ForestExploreResponse {
  dim: ForestDimRow[]; quant: ForestQuantRow[]; cross: ForestCrossRow[];
  hist: ForestHistRow[]; district: ForestDistrictRow[];
}

export async function fetchForestExplore(): Promise<ForestExploreResponse> {
  const res = await fetch(`${API_BASE}/api/stats/forest/explore`);
  if (!res.ok) throw new Error(`stats/forest/explore ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: Typecheck**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && cd apps/web && npx tsc --noEmit`
Expected: clean (api-client is consumed by web; this proves the types compile).

- [ ] **Step 3: Commit**

```bash
git add packages/api-client/src/index.ts
git commit -m "feat(stats): api-client — ForestExploreResponse + fetchForestExplore"
```

---

### Task 6: Pure transforms + tests (TDD)

**Files:**
- Create: `apps/web/src/components/stats/forest/transforms.ts`
- Test: `apps/web/src/components/stats/forest/transforms.test.ts`

Conventions: ZERO React/Recharts imports (pure). Mirror `apps/web/src/components/stats/season/transforms.ts` style. Import the row types from `@mushroom-map/api-client`.

Constants + functions to implement (exact signatures):

```typescript
export const SPECIES_MAIN = ["birch", "pine", "spruce", "aspen", "alder"] as const;
export const SPECIES_LABELS_RU: Record<string, string> = {
  birch: "Берёза", pine: "Сосна", spruce: "Ель", aspen: "Осина",
  alder: "Ольха", other: "Прочие",
};
export const AGE_ORDER = ["молодняки", "средневозрастные", "приспевающие", "спел285ые", "спелые", "перестойные", "не определён"] as const;
// NOTE: AGE_ORDER must be exactly: молодняки, средневозрастные, приспевающие, спелые, перестойные, не определён

export function foldSpeciesKey(k: string): string;       // main → itself, else "other"
export function speciesAreaRanking(dim: ForestDimRow[]): { key: string; label: string; area_km2: number }[]; // idea 1, folded, desc
export function meanStandSize(dim: ForestDimRow[]): { key: string; label: string; ha: number }[];            // idea 2: area_km2*100/polygon_count
export function quantToRangeItems(quant: ForestQuantRow[], kind: string, metric: string, labelFn: (k: string) => string): { label: string; start: number; end: number; mark: number }[]; // ideas 3,7,8 (p25,p75,p50)
export function bonitetRanking(dim: ForestDimRow[]): { key: string; label: string; area_km2: number }[];     // idea 4: keys 1..5 ordered, "н/д" last
export function histBars(hist: ForestHistRow[], metric: string): { bin: string; area_km2: number }[];        // idea 5
export function crossMatrix(cross: ForestCrossRow[], dimA: string, dimB: string, rowOrder: string[], colOrder: string[]): { rows: string[]; cols: string[]; values: number[][] }; // ideas 6,12 (area-weighted)
export function ageStructure(dim: ForestDimRow[]): { key: string; label: string; area_km2: number }[];       // idea 9, AGE_ORDER
export function crossStacked100(cross: ForestCrossRow[], dimA: string, dimB: string, colOrder: string[], aLabel: (k: string) => string, bLabel: (k: string) => string): { rows: { name: string; shares: Record<string, number> }[]; series: string[] }; // ideas 10,13,17 (each row renormalised to 1)
export function matureSharePerSpecies(cross: ForestCrossRow[]): { key: string; label: string; pct: number }[]; // idea 11: (спелые+перестойные)/total per species, desc
export function districtRanking(district: ForestDistrictRow[], field: "forest_pct" | "mean_bonitet" | "mean_stock" | "mature_host_pct"): { name: string; value: number }[]; // ideas 14,15,16, nulls dropped, desc (asc for mean_bonitet — lower=better)
```

- [ ] **Step 1: Write the failing tests**

Create `transforms.test.ts` with these cases (use small synthetic fixtures typed as the api-client interfaces):

```typescript
import { describe, it, expect } from "vitest";
import {
  foldSpeciesKey, speciesAreaRanking, meanStandSize, quantToRangeItems,
  bonitetRanking, histBars, crossMatrix, ageStructure, crossStacked100,
  matureSharePerSpecies, districtRanking, SPECIES_LABELS_RU, AGE_ORDER,
} from "./transforms";
import type { ForestDimRow, ForestQuantRow, ForestCrossRow, ForestHistRow, ForestDistrictRow } from "@mushroom-map/api-client";

describe("foldSpeciesKey", () => {
  it("keeps the 5 main species", () => {
    expect(foldSpeciesKey("pine")).toBe("pine");
    expect(foldSpeciesKey("birch")).toBe("birch");
  });
  it("folds the rare tail to other", () => {
    expect(foldSpeciesKey("oak")).toBe("other");
    expect(foldSpeciesKey("larch")).toBe("other");
  });
});

describe("speciesAreaRanking", () => {
  it("folds tail into 'other' and sorts by area desc", () => {
    const dim: ForestDimRow[] = [
      { dimension: "species", key: "pine", label: "pine", area_km2: 100, polygon_count: 10 },
      { dimension: "species", key: "birch", label: "birch", area_km2: 90, polygon_count: 9 },
      { dimension: "species", key: "oak", label: "oak", area_km2: 3, polygon_count: 1 },
      { dimension: "species", key: "larch", label: "larch", area_km2: 2, polygon_count: 1 },
    ];
    const r = speciesAreaRanking(dim);
    expect(r[0]).toEqual({ key: "pine", label: "Сосна", area_km2: 100 });
    expect(r.find(x => x.key === "other")).toEqual({ key: "other", label: "Прочие", area_km2: 5 });
    expect(r.map(x => x.area_km2)).toEqual([...r.map(x => x.area_km2)].sort((a, b) => b - a));
  });
});

describe("meanStandSize", () => {
  it("ha = area_km2 * 100 / polygon_count, folded", () => {
    const dim: ForestDimRow[] = [
      { dimension: "species", key: "pine", label: "pine", area_km2: 100, polygon_count: 5000 },
    ];
    expect(meanStandSize(dim)[0].ha).toBeCloseTo(2.0, 6); // 100*100/5000
  });
});

describe("quantToRangeItems", () => {
  it("maps p25/p75/p50 to start/end/mark", () => {
    const q: ForestQuantRow[] = [
      { group_kind: "species", group_key: "pine", metric: "stock", n: 9, p10: 50, p25: 120, p50: 195, p75: 250, p90: 400 },
    ];
    const r = quantToRangeItems(q, "species", "stock", k => SPECIES_LABELS_RU[k] ?? k);
    expect(r[0]).toEqual({ label: "Сосна", start: 120, end: 250, mark: 195 });
  });
});

describe("bonitetRanking", () => {
  it("orders 1..5 then н/д, RU not required", () => {
    const dim: ForestDimRow[] = [
      { dimension: "bonitet", key: "3", label: "3", area_km2: 30, polygon_count: 3 },
      { dimension: "bonitet", key: "1", label: "1", area_km2: 10, polygon_count: 1 },
      { dimension: "bonitet", key: "unknown", label: "unknown", area_km2: 1, polygon_count: 1 },
    ];
    const r = bonitetRanking(dim);
    expect(r.map(x => x.key)).toEqual(["1", "3", "н/д"]);
  });
});

describe("histBars", () => {
  it("formats bin label and keeps area", () => {
    const h: ForestHistRow[] = [
      { metric: "stock", bin_lo: 0, bin_hi: 20, area_km2: 5, polygon_count: 2 },
      { metric: "stock", bin_lo: 20, bin_hi: 40, area_km2: 9, polygon_count: 3 },
    ];
    const r = histBars(h, "stock");
    expect(r).toEqual([
      { bin: "0–20", area_km2: 5 },
      { bin: "20–40", area_km2: 9 },
    ]);
  });
});

describe("crossMatrix", () => {
  it("builds an area-weighted row×col matrix in the given order", () => {
    const cross: ForestCrossRow[] = [
      { dim_a: "species", key_a: "pine", dim_b: "bonitet", key_b: "2", area_km2: 50, polygon_count: 5 },
      { dim_a: "species", key_a: "pine", dim_b: "bonitet", key_b: "3", area_km2: 30, polygon_count: 3 },
      { dim_a: "species", key_a: "birch", dim_b: "bonitet", key_b: "2", area_km2: 20, polygon_count: 2 },
    ];
    const m = crossMatrix(cross, "species", "bonitet", ["pine", "birch"], ["2", "3"]);
    expect(m.values).toEqual([[50, 30], [20, 0]]);
  });
});

describe("ageStructure", () => {
  it("orders by AGE_ORDER", () => {
    const dim: ForestDimRow[] = [
      { dimension: "age_group", key: "спелые", label: "спелые", area_km2: 30, polygon_count: 3 },
      { dimension: "age_group", key: "молодняки", label: "молодняки", area_km2: 10, polygon_count: 1 },
    ];
    const r = ageStructure(dim);
    expect(r.map(x => x.key)).toEqual(["молодняки", "спелые"]);
    expect(AGE_ORDER.indexOf("молодняки")).toBeLessThan(AGE_ORDER.indexOf("спелые"));
  });
});

describe("crossStacked100", () => {
  it("renormalises each row to sum 1", () => {
    const cross: ForestCrossRow[] = [
      { dim_a: "district", key_a: "47", dim_b: "species", key_b: "pine", area_km2: 75, polygon_count: 7 },
      { dim_a: "district", key_a: "47", dim_b: "species", key_b: "birch", area_km2: 25, polygon_count: 2 },
    ];
    const s = crossStacked100(cross, "district", "species", ["pine", "birch", "spruce", "aspen", "alder", "other"], k => k, k => SPECIES_LABELS_RU[k] ?? k);
    const row = s.rows[0];
    const sum = Object.values(row.shares).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 9);
    expect(row.shares["pine"]).toBeCloseTo(0.75, 9);
  });
});

describe("matureSharePerSpecies", () => {
  it("(спелые+перестойные)/total per species, desc", () => {
    const cross: ForestCrossRow[] = [
      { dim_a: "species", key_a: "spruce", dim_b: "age", key_b: "спелые", area_km2: 60, polygon_count: 6 },
      { dim_a: "species", key_a: "spruce", dim_b: "age", key_b: "перестойные", area_km2: 20, polygon_count: 2 },
      { dim_a: "species", key_a: "spruce", dim_b: "age", key_b: "молодняки", area_km2: 20, polygon_count: 2 },
    ];
    expect(matureSharePerSpecies(cross)[0]).toEqual({ key: "spruce", label: "Ель", pct: 80 });
  });
});

describe("districtRanking", () => {
  it("drops nulls; desc for forest_pct, asc for mean_bonitet", () => {
    const d: ForestDistrictRow[] = [
      { district_id: 1, district_name: "A", land_km2: 100, forest_km2: 60, forest_pct: 60, mean_bonitet: 3.1, mean_stock: 200, mature_host_pct: 10 },
      { district_id: 2, district_name: "B", land_km2: 100, forest_km2: 40, forest_pct: 40, mean_bonitet: 2.2, mean_stock: 180, mature_host_pct: 20 },
      { district_id: 3, district_name: "C", land_km2: 100, forest_km2: 50, forest_pct: 50, mean_bonitet: null, mean_stock: null, mature_host_pct: null },
    ];
    expect(districtRanking(d, "forest_pct").map(x => x.name)).toEqual(["A", "C", "B"]);
    expect(districtRanking(d, "mean_bonitet").map(x => x.name)).toEqual(["B", "A"]); // lower=better, asc, null dropped
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `cd apps/web && npx vitest run src/components/stats/forest/transforms.test.ts`
Expected: FAIL (module `./transforms` not found / functions undefined).

- [ ] **Step 3: Implement `transforms.ts`**

Implement every function to satisfy the tests. Key rules: `foldSpeciesKey` uses `SPECIES_MAIN`; ranking/stacked helpers fold species via `foldSpeciesKey` and sum folded; `bonitetRanking` maps non-numeric keys (`unknown`/empty) to label `"н/д"` sorted last, numeric keys ascending; `crossMatrix` zero-fills missing cells; `crossStacked100` renormalises each row to exactly 1 (divide by row sum; row sum 0 → all 0); `districtRanking` drops rows whose chosen field is null, sorts desc EXCEPT `mean_bonitet` ascending (lower bonitet = better forest). No `any`; use the api-client types.

- [ ] **Step 4: Run tests — verify they pass**

Run: `cd apps/web && npx vitest run src/components/stats/forest/transforms.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/stats/forest/transforms.ts apps/web/src/components/stats/forest/transforms.test.ts
git commit -m "feat(stats): forest transforms + tests (fold/rank/cross/quant/district)"
```

---

### Task 7: `StackedBarChart` wrapper (NEW, Recharts-isolated)

**Files:**
- Create: `apps/web/src/components/stats/charts/StackedBarChart.tsx`

- [ ] **Step 1: Implement the wrapper**

```tsx
/**
 * StackedBarChart — 100%-стек горизонтальных баров (composition по
 * дискретной категории). Recharts изолирован здесь; цвета только из
 * переданных CSS-var-имён (Claude Design проход переодевает токены).
 */
import {
  ResponsiveContainer,
  BarChart as RBarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

export interface StackedSeries {
  key: string;
  label: string;
  color: string; // "var(--idx-N)"
}

export interface StackedBarChartProps {
  data: Array<Record<string, number | string>>; // each row: {category, ...series shares 0..1}
  categoryKey: string;
  series: StackedSeries[];
  height?: number;
}

export function StackedBarChart({ data, categoryKey, series, height = 360 }: StackedBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RBarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <XAxis
          type="number"
          domain={[0, 1]}
          tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
          stroke="var(--ink-faint)"
          fontSize="var(--fs-xs)"
        />
        <YAxis
          type="category"
          dataKey={categoryKey}
          stroke="var(--ink-faint)"
          fontSize="var(--fs-xs)"
          width={140}
        />
        <Tooltip
          contentStyle={{
            background: "var(--paper-rise)",
            border: "1px solid var(--rule)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--fs-xs)",
          }}
          formatter={(v: number, n: string) => [`${Math.round(v * 100)}%`, n]}
        />
        <Legend wrapperStyle={{ fontSize: "var(--fs-xs)" }} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} stackId="1" fill={s.color} />
        ))}
      </RBarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/stats/charts/StackedBarChart.tsx
git commit -m "feat(stats): chart-обёртка StackedBarChart (100%-стек)"
```

---

### Task 8: `ForestTab` compose (17 cards, 4 sections) + wire

**Files:**
- Create: `apps/web/src/routes/stats/ForestTab.tsx`
- Create: `apps/web/src/components/stats/forest/ForestCharts.module.css`
- Modify: `apps/web/src/routes/stats/StatsTabs.tsx`

Reference (read first, replicate structure — do not invent a new layout): `apps/web/src/routes/stats/SeasonalityTab.tsx` (single `fetch` in `useEffect`, `loading`/`error`/empty states, `<section>` with `css.h` heading + card grid `css.card`/`css.ct`/`css.ci`) and `apps/web/src/components/stats/season/SeasonCharts.module.css` (copy it verbatim into `ForestCharts.module.css` — identical class names `card/ct/ci/empty/section/h/grid`).

- [ ] **Step 1: Create `ForestCharts.module.css`**

Copy the full contents of `apps/web/src/components/stats/season/SeasonCharts.module.css` into the new file unchanged (same class names; the Claude Design pass restyles both).

- [ ] **Step 2: Create `ForestTab.tsx`**

A single component that:
1. `useEffect` → `fetchForestExplore()` once into state; render a `css.empty` "Загрузка…" / error string while pending; if `dim` empty render "Нет данных.".
2. Derives all chart data via the Task-6 transforms (no inline data math beyond calling them).
3. Renders 4 `<section>`s with `<h2 className={css.h}>` titles "Состав леса" / "Качество и продуктивность" / "Возрастная структура" / "География", each containing a `css.grid` of `css.card`s. Each card: `<h3 className={css.ct}>` title + `<p className={css.ci}>` one-line caption + the chart. Use exact card titles from the "17 ideas" list above.
4. Chart usage per idea:
   - 1 `BarChart` data=`speciesAreaRanking` categoryKey="label" valueKey="area_km2"
   - 2 `BarChart` data=`meanStandSize` categoryKey="label" valueKey="ha"
   - 3 `RangeBars` items=`quantToRangeItems(quant,"species","area_ha",…)` min/max from data, ticks 3–5 round values
   - 4 `BarChart` data=`bonitetRanking`
   - 5 `BarChart` data=`histBars(hist,"stock")` categoryKey="bin" valueKey="area_km2"
   - 6 `Heatmap` from `crossMatrix(cross,"species","bonitet",SPECIES_MAIN+other,["1","2","3","4","5"])`
   - 7 `RangeBars` from `quantToRangeItems(quant,"species","stock",…)`
   - 8 `RangeBars` from `quantToRangeItems(quant,"bonitet","stock",…)` labels "Бонитет {k}"
   - 9 `BarChart` data=`ageStructure`
   - 10 `StackedBarChart` from `crossStacked100(cross,"species","age",AGE_ORDER,…)` categoryKey="name" series=age classes (palette `var(--idx-0..5)`)
   - 11 `BarChart` data=`matureSharePerSpecies` valueKey="pct"
   - 12 `Heatmap` from `crossMatrix(cross,"age","bonitet",AGE_ORDER,["1","2","3","4","5"])`
   - 13 `StackedBarChart` from `crossStacked100(cross,"district","species",[species…],dLabel=district_name via a district_id→name map built from response.district, bLabel=SPECIES_LABELS_RU)`
   - 14 `BarChart` data=`districtRanking(district,"forest_pct")` categoryKey="name" valueKey="value"
   - 15 two cards: `districtRanking(district,"mean_bonitet")` and `districtRanking(district,"mean_stock")` (idea 15 = one card with the stock ranking; put bonitet ranking as the caption-noted companion OR a second `BarChart` in the same card stacked vertically — keep ONE card, show mean_stock ranking, caption mentions "бонитет в подсказке"). To stay 17 cards total: card 15 = mean_stock ranking only; mean_bonitet is covered by card 16's section context. (Do NOT add an 18th card.)
   - 16 `BarChart` data=`districtRanking(district,"mature_host_pct")` valueKey="value" — caption: "Доля спелых/перестойных сосны+ели+берёзы — структурный прокси грибного потенциала, не наблюдённый сбор."
   - 17 `StackedBarChart` from `crossStacked100(cross,"district","age",AGE_ORDER,dName,aLabel=identity)`
5. Captions must state honest caveats where relevant (idea 16 proxy disclaimer; idea 14 "% площади района под лесом по ФГИСЛК").
6. Build a `districtName: Record<string,string>` from `resp.district` (`String(district_id) → district_name`) to translate `key_a` in district crosses.
7. No Recharts import in this file; only the wrappers. No hardcoded hex colours; stacked palettes use `var(--idx-0)`…`var(--idx-7)` (same tokens SeasonalityTab uses for composition).

- [ ] **Step 3: Wire the tab in `StatsTabs.tsx`**

Add `import { ForestTab } from "./ForestTab";` and change the render branch:

```tsx
{active === "seasonality" ? (
  <SeasonalityTab />
) : active === "forest" ? (
  <ForestTab />
) : active === "obzor" ? (
  <p className={styles.placeholder}>
    Обзор соберём из ключевых графиков остальных вкладок — появится последним.
  </p>
) : (
  <p className={styles.placeholder}>Вкладка в работе.</p>
)}
```

- [ ] **Step 4: Typecheck + unit tests + build**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run src/components/stats/forest/transforms.test.ts && npm run build`
Expected: tsc clean; all forest tests pass; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/stats/ForestTab.tsx apps/web/src/components/stats/forest/ForestCharts.module.css apps/web/src/routes/stats/StatsTabs.tsx
git commit -m "feat(stats): вкладка Лес — 17 графиков (compose + wire)"
```

---

### Task 9: Mandatory visual-QA loop

**Files:** none (verification + targeted fixes only)

This is the user's explicit mandate ("посмотри их глазами и найди проблемы, исправь") — loop until every card is correct and readable.

- [ ] **Step 1: Ensure dev servers up**

Run: `curl -s -o /dev/null -w "web:%{http_code} api:%{http_code}\n" http://localhost:5173/stats "http://localhost:8000/api/stats/forest/explore"` — expect `web:200 api:200`. If down, start web (`export PATH="/c/Program Files/nodejs:$PATH" && npm run dev` from repo root) and confirm the worktree API :8000 is reload-serving the new endpoint.

- [ ] **Step 2: Capture all 17 cards**

Adapt `C:/tmp/season_qa.cjs` → `C:/tmp/forest_qa.cjs` (change URL to `http://localhost:5173/stats?tab=forest`, output prefix `forest_`). Run it (`cd /c/tmp && node forest_qa.cjs`). It writes `C:/tmp/forest_NN.png` per card + `forest_qa.json` + console errors.

- [ ] **Step 3: Read every screenshot and judge**

Read each `C:/tmp/forest_NN.png`. For each card check: axis labels readable & RU (no `species_key` like "pine"); no overlap/clipping; stacked bars sum to 100% with a legend; ranking bars sorted & start at 0; heatmap labels not colliding; honest caption present; no empty/garbled charts; console errors only the known unrelated 401 auth noise.

- [ ] **Step 4: Fix every defect found**

For each defect, fix at the right layer (transform / wrapper / caption), keeping Recharts isolated, CSS-var colours, no emojis, every changed line traceable. Re-run `npx tsc --noEmit` + the forest vitest after fixes.

- [ ] **Step 5: Re-capture + re-verify (loop)**

Re-run `forest_qa.cjs`, re-read affected cards. Repeat Steps 3–5 until ALL 17 cards are clean and no new defects. Do not declare done on agent report alone — eyes-on every card.

- [ ] **Step 6: Commit the QA fixes**

```bash
git add -A apps/web
git commit -m "fix(stats): Лес visual-QA — <enumerate defects fixed>"
```

- [ ] **Step 7: Update exit-state**

Append a short "Лес tab DONE — 17 cards visually verified" note to `docs/superpowers/plans/2026-05-17-stats-tab-forest.md` and update memory (`project_stats_section.md`) per the iteration workflow. No prod deploy / no push (user reviews first).

---

## Self-Review

**Spec coverage:** all 17 approved ideas map to a card in Task 8 (1–3 Состав, 4–8 Качество, 9–12 Возраст, 13–17 География); district = ranking bars (user choice). Excluded-by-audit items (mixed forest, canopy, trends) are correctly absent. Reuse of existing `stats_forest` for 1-D dims avoids a redundant table.

**Placeholder scan:** all SQL, the wrapper, the tests, and the transform signatures are given in full. Task 8 references the in-repo `SeasonalityTab.tsx`/`SeasonCharts.module.css` as the established pattern (legitimate per writing-skills "follow established patterns") and enumerates every card's exact data source + wrapper — no "similar to" hand-waving.

**Type consistency:** api-client interfaces (Task 5) are consumed unchanged by transforms (Task 6) and ForestTab (Task 8). `crossStacked100`/`crossMatrix`/`quantToRangeItems` signatures match their Task-8 call sites. `StackedBarChart` props (Task 7) match the `crossStacked100` output shape (`rows:{name,shares}` → `data` rows `{category,...shares}`; ForestTab maps `rows`→`data` by spreading `shares` + `name`). Card count fixed at 17 (idea 15 explicitly one card; no 18th).
