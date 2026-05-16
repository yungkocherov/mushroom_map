# «Статистика» — Phase 2 (Overview Hub) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the skeleton `/stats` into a real overview dashboard — KPI strip, seasonal-pulse chart, trending species, forest-composition viz, species mini-leaderboard, weather snapshot — and extend the snapshot pipeline to read `forecast.*` weather read-only.

**Architecture:** Reuse the Phase-1 precomputed-snapshot model. One new snapshot table (`stats_weather_monthly`) fed from `forecast.weather_daily` (read-only, `to_regclass`-guarded — sister-repo schema may be absent). One new read endpoint (`/api/stats/weather`); KPI reuses extended `/api/stats/corpus`. Frontend: `StatsHubPage` fetches all endpoints and passes plain data to presentational widgets; charts stay isolated behind `components/stats/charts/*` (CSS-var themed) so the Claude Design pass re-skins without touching logic.

**Tech Stack:** PostgreSQL/PostGIS, psycopg3, FastAPI, pytest, React 18 + react-router 7 (lazy), Recharts, TypeScript, Vite.

**Spec:** `docs/superpowers/specs/2026-05-16-stats-section-design.md`. Phase 1 shipped on branch `claude/upbeat-archimedes-da0d9c` (migration 042, `pipelines/build_stats_snapshot.py`, `/api/stats/{meta,forest,vk/timeline,corpus}`, api-client fetchers, lazy `/stats` skeleton, `components/stats/charts/LineChart.tsx`). **Phase 3** (district/species profiles) will use migration `044_stats_profiles.sql` — Phase 2 takes `043`. Phase 4 = model/corpus + Claude Design handoff.

---

## Environment (every command assumes these)

- **Worktree root (cwd):** `C:/Users/ikoch/mushroom-map/.claude/worktrees/upbeat-archimedes-da0d9c`
- **Python:** `/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe` (worktree has no `.venv` by design — interpreter from main repo, code from worktree cwd). Prefix non-ASCII-printing commands with `PYTHONIOENCODING=utf-8`.
- **DB DSN (dev):** `postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map` (port 5434).
- **Node on PATH before npm/npx:** `export PATH="/c/Program Files/nodejs:$PATH"`. node_modules already installed in the worktree (Phase 1).
- **psycopg3 `%` trap:** pipeline SQL (no params) must be `%`-free; endpoint SQL uses real `%s` placeholders WITH a params tuple. Keep it that way.
- **forecast.* is sister-repo-owned** and may be absent in CI/dev. Every read of `forecast.*` MUST be guarded by `to_regclass('forecast.<table>') IS NOT NULL` (see migration 036 for the established pattern). We read `forecast.*` read-only and write only `public.stats_*`. We never write `forecast.*`.
- **No prod deploy.** Commits land on the current worktree branch only; do not `git push`.
- **TDD-test runner:** `PYTHONIOENCODING=utf-8 /c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe -m pytest <path> -q`
- **Typecheck/build:** `export PATH="/c/Program Files/nodejs:$PATH" && cd apps/web && npx tsc --noEmit && cd ../..` ; `npm run build` from `apps/web`.

---

## File Structure

**Created:**
- `db/migrations/043_stats_weather.sql` — `public.stats_weather_monthly` (LO-aggregate monthly weather + climatology rows).
- `apps/web/src/components/stats/charts/BarChart.tsx` — horizontal bar/share chart wrapper (Recharts-isolated, CSS-var themed).
- `apps/web/src/components/stats/charts/AreaChart.tsx` — stacked-area wrapper (seasonal pulse).
- `apps/web/src/components/stats/KpiStrip.tsx` + `.module.css` — KPI cards (presentational).
- `apps/web/src/components/stats/TrendingSpecies.tsx` + `.module.css` — "сейчас собирают".
- `apps/web/src/components/stats/ForestComposition.tsx` + `.module.css` — composition with dimension toggle.
- `apps/web/src/components/stats/SeasonPulse.tsx` + `.module.css` — week-of-year activity, year overlay.
- `apps/web/src/components/stats/SpeciesLeaderboardMini.tsx` + `.module.css` — top species by finds.
- `apps/web/src/components/stats/WeatherSnapshot.tsx` + `.module.css` — monthly temp/precip vs normal.

**Modified:**
- `pipelines/build_stats_snapshot.py` — add `stats_weather_monthly` step (forecast-guarded); extend `_CORPUS_SQL` with `species_count` + `district_count` metrics.
- `pipelines/tests/test_build_stats_snapshot.py` — registry assertions for the new step.
- `services/api/src/api/routes/stats.py` — append `GET /api/stats/weather`.
- `services/api/tests/test_stats_phase1.py` — append `/weather` offline + smoke tests (same file; the suite is "stats", phase-agnostic).
- `packages/api-client/src/index.ts` — append `StatsWeatherResponse` + `fetchStatsWeather`.
- `apps/web/src/routes/stats/StatsHubPage.tsx` + `StatsHubPage.module.css` — replace skeleton with the real dashboard composing the widgets.
- `CLAUDE.md` — record the widened `forecast.*` read contract + the live `/stats` hub.

---

## Task 1: Migration — `stats_weather_monthly`

**Files:** Create `db/migrations/043_stats_weather.sql`

- [ ] **Step 1: Write the migration** (zero `%` characters)

```sql
-- 2026-05-16: stats weather snapshot (раздел «Статистика», Phase 2).
--
-- LO-агрегат помесячной погоды для overview-хаба. Наполняется
-- pipelines/build_stats_snapshot.py из forecast.weather_daily
-- (сестринский репо, read-only, под to_regclass-guard). Мы НЕ пишем
-- forecast.*. year=0 — климатологическая норма (среднее по годам).
--
-- Per-district погода (профиль района) — Phase 3, отдельная миграция.

CREATE TABLE IF NOT EXISTS stats_weather_monthly (
    year             INTEGER NOT NULL,   -- 0 = климатология (норма)
    month            SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    temp_mean        DOUBLE PRECISION,
    precip_sum       DOUBLE PRECISION,
    soil_moist_mean  DOUBLE PRECISION,
    PRIMARY KEY (year, month)
);
```

- [ ] **Step 2: Apply**

```bash
PYTHONIOENCODING=utf-8 /c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe db/migrate.py --dsn "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map"
```
Expected: `-> 043_stats_weather.sql` then `Применено миграций: 1` (or `Все миграции уже применены.`).

- [ ] **Step 3: Verify**

```bash
/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe -c "import psycopg; c=psycopg.connect('postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map'); print(c.execute(\"SELECT count(*) FROM information_schema.columns WHERE table_name='stats_weather_monthly'\").fetchone()[0])"
```
Expected: `5`

- [ ] **Step 4: Commit**

```bash
git add db/migrations/043_stats_weather.sql
git commit -m "feat(stats): миграция 043 — stats_weather_monthly"
```

---

## Task 2: Pipeline — weather step + corpus KPI extension

**Files:** Modify `pipelines/build_stats_snapshot.py`, `pipelines/tests/test_build_stats_snapshot.py`

- [ ] **Step 1: Update the failing test**

In `pipelines/tests/test_build_stats_snapshot.py`, change `test_steps_cover_exactly_phase1_tables` to also expect the weather step. Replace the existing function body’s expected set with:

```python
def test_steps_cover_exactly_phase1_tables() -> None:
    tables = {table for table, _sql in mod.SNAPSHOT_STEPS}
    assert tables == {
        "stats_meta",
        "stats_forest",
        "stats_vk_timeline",
        "stats_corpus",
        "stats_weather_monthly",
    }
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
PYTHONIOENCODING=utf-8 /c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe -m pytest pipelines/tests/test_build_stats_snapshot.py -q
```
Expected: FAIL on `test_steps_cover_exactly_phase1_tables` (set mismatch — weather step not yet added). The `%`-safety and `main` tests still pass.

- [ ] **Step 3: Verify the real `forecast.weather_daily` columns before writing SQL**

```bash
/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe -c "import psycopg; c=psycopg.connect('postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map'); r=c.execute(\"SELECT to_regclass('forecast.weather_daily')\").fetchone()[0]; print('exists=',r); print([x[0] for x in c.execute(\"SELECT column_name FROM information_schema.columns WHERE table_schema='forecast' AND table_name='weather_daily' ORDER BY 1\").fetchall()]) if r else None"
```
Expected: either `exists= None` (schema absent — fine, the guarded step will no-op) OR `exists= forecast.weather_daily` plus a column list. The SQL in Step 4 assumes columns `date`, `temperature_2m_mean`, `precipitation_sum`, `soil_moisture_1_to_3cm`. If the table exists but a column name differs, substitute the real name of the same concept (mean daily air temperature; daily precipitation total; the deeper "mycelium" soil-moisture layer). If the table exists but none of those *concepts* exist, STOP and report BLOCKED with the real column list — do not invent metrics.

- [ ] **Step 4: Add the weather step + extend corpus**

In `pipelines/build_stats_snapshot.py`, add this constant after `_CORPUS_SQL` (it is fully guarded — if `forecast.weather_daily` is absent it selects zero rows; zero `%`):

```python
_WEATHER_SQL = """
    INSERT INTO stats_weather_monthly (year, month, temp_mean, precip_sum, soil_moist_mean)
    WITH src AS (
        SELECT
            EXTRACT(YEAR  FROM date)::int AS y,
            EXTRACT(MONTH FROM date)::int AS m,
            temperature_2m_mean      AS t,
            precipitation_sum        AS p,
            soil_moisture_1_to_3cm   AS sm
        FROM forecast.weather_daily
        WHERE to_regclass('forecast.weather_daily') IS NOT NULL
    ),
    per_year AS (
        SELECT y, m,
               AVG(t)  AS temp_mean,
               AVG(p)  AS precip_sum,
               AVG(sm) AS soil_moist_mean
        FROM src
        GROUP BY y, m
    ),
    climatology AS (
        SELECT 0 AS y, m,
               AVG(temp_mean)       AS temp_mean,
               AVG(precip_sum)      AS precip_sum,
               AVG(soil_moist_mean) AS soil_moist_mean
        FROM per_year
        GROUP BY m
    )
    SELECT y, m, temp_mean, precip_sum, soil_moist_mean FROM per_year
    UNION ALL
    SELECT y, m, temp_mean, precip_sum, soil_moist_mean FROM climatology
"""
```

Note: `WHERE to_regclass(...) IS NOT NULL` referencing `forecast.weather_daily` only parses if the schema/table exists at plan time. To make the step safe when the schema is entirely absent, the `run()` loop must skip it when `to_regclass` is NULL. Implement that guard in `run()` (Step 5).

Then change `_CORPUS_SQL`: add two metric rows. Locate the line `    SELECT 'posts_total',` and immediately BEFORE the final `UNION ALL\n    SELECT 'classification_distribution',` block, the easiest non-fragile edit is to append the two metrics right after the `forest_area_km2` block. Replace exactly:

```python
    UNION ALL
    SELECT 'forest_area_km2',
           (SELECT COALESCE(SUM(ST_Area(geometry::geography)), 0) / 1e6
              FROM forest_unified),
           NULL, '{}'::jsonb
    UNION ALL
    SELECT 'forest_sources',
```

with:

```python
    UNION ALL
    SELECT 'forest_area_km2',
           (SELECT COALESCE(SUM(ST_Area(geometry::geography)), 0) / 1e6
              FROM forest_unified),
           NULL, '{}'::jsonb
    UNION ALL
    SELECT 'species_count',
           (SELECT COUNT(*) FROM species),
           NULL, '{}'::jsonb
    UNION ALL
    SELECT 'district_count',
           (SELECT COUNT(*) FROM admin_area WHERE level = 6),
           NULL, '{}'::jsonb
    UNION ALL
    SELECT 'forest_sources',
```

Then register the weather step. Replace exactly:

```python
SNAPSHOT_STEPS: list[tuple[str, str]] = [
    ("stats_meta", _META_SQL),
    ("stats_forest", _FOREST_SQL),
    ("stats_vk_timeline", _VK_TIMELINE_SQL),
    ("stats_corpus", _CORPUS_SQL),
]
```

with:

```python
SNAPSHOT_STEPS: list[tuple[str, str]] = [
    ("stats_meta", _META_SQL),
    ("stats_forest", _FOREST_SQL),
    ("stats_vk_timeline", _VK_TIMELINE_SQL),
    ("stats_corpus", _CORPUS_SQL),
    ("stats_weather_monthly", _WEATHER_SQL),
]

# forecast.* — собственность сестринского репо, может отсутствовать в
# CI/dev. Шаги, читающие forecast.*, пропускаем если схемы нет.
_FORECAST_GUARDED = {"stats_weather_monthly": "forecast.weather_daily"}
```

Then replace the `run()` function exactly:

```python
def run(conn: psycopg.Connection) -> None:
    for table, sql in SNAPSHOT_STEPS:
        guard = _FORECAST_GUARDED.get(table)
        if guard is not None:
            with conn.cursor() as cur:
                cur.execute("SELECT to_regclass(%s)", (guard,))
                if cur.fetchone()[0] is None:
                    print(f"  -> {table}: SKIP ({guard} absent — sister-repo schema)", flush=True)
                    conn.rollback()
                    continue
        t0 = time.monotonic()
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(f"TRUNCATE {table}")
                cur.execute(sql)
                n = cur.rowcount
        print(f"  -> {table}: {n} rows in {time.monotonic() - t0:.1f}s", flush=True)
```

(The `to_regclass(%s)` here is a real psycopg parameter — correct, not the no-param trap. `conn.rollback()` clears the implicit txn opened by the guard SELECT so the skip is clean.)

- [ ] **Step 5: Run test, verify PASS**

```bash
PYTHONIOENCODING=utf-8 /c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe -m pytest pipelines/tests/test_build_stats_snapshot.py -q
```
Expected: `3 passed` (registry now includes `stats_weather_monthly`; `%`-safety still green — `_WEATHER_SQL` has no `%`).

- [ ] **Step 6: Run the pipeline, verify**

```bash
PYTHONIOENCODING=utf-8 /c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe pipelines/build_stats_snapshot.py --dsn "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map"
```
Expected: the prior four `-> stats_*` lines, then either `-> stats_weather_monthly: N rows` (if `forecast.weather_daily` exists and has data) or `-> stats_weather_monthly: SKIP (forecast.weather_daily absent — sister-repo schema)`, then `STATS_SNAPSHOT_DONE`. Both outcomes are correct. Then verify the new corpus metrics:

```bash
/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe -c "import psycopg; c=psycopg.connect('postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map'); print({m:(vn,vt) for m,vn,vt in c.execute(\"SELECT metric,value_num,value_text FROM stats_corpus WHERE metric IN ('species_count','district_count')\").fetchall()})"
```
Expected: both present, `district_count` value_num = 18, `species_count` > 0.

- [ ] **Step 7: Commit**

```bash
git add pipelines/build_stats_snapshot.py pipelines/tests/test_build_stats_snapshot.py
git commit -m "feat(stats): weather snapshot (forecast.* read-only, guarded) + KPI metrics"
```

---

## Task 3: API — `GET /api/stats/weather`

**Files:** Modify `services/api/src/api/routes/stats.py`, `services/api/tests/test_stats_phase1.py`

- [ ] **Step 1: Append failing tests** to `services/api/tests/test_stats_phase1.py`:

```python


def test_weather_empty_shape(offline_client: TestClient) -> None:
    r = offline_client.get("/api/stats/weather")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"months", "climatology"}
    assert body["months"] == []
    assert body["climatology"] == []
```

- [ ] **Step 2: Run, verify FAIL** (`/api/stats/weather` 404):

```bash
PYTHONIOENCODING=utf-8 /c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe -m pytest services/api/tests/test_stats_phase1.py -q
```

- [ ] **Step 3: Append the endpoint** to the END of `services/api/src/api/routes/stats.py`:

```python


@router.get("/weather")
def stats_weather(response: Response) -> dict:
    """Помесячная погода ЛО (агрегат) + климатнорма. Из snapshot.
    year=0 в stats_weather_monthly — норма. Пусто → пустые массивы
    (forecast.* отсутствует / снапшот не собран)."""
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT year, month, temp_mean, precip_sum, soil_moist_mean
            FROM stats_weather_monthly
            ORDER BY year, month
            """
        ).fetchall()
    response.headers["Cache-Control"] = _STATS_CACHE
    months, climatology = [], []
    for year, month, t, p, sm in rows or []:
        rec = {
            "year": int(year),
            "month": int(month),
            "temp_mean": round(float(t), 1) if t is not None else None,
            "precip_sum": round(float(p), 1) if p is not None else None,
            "soil_moist_mean": round(float(sm), 3) if sm is not None else None,
        }
        (climatology if int(year) == 0 else months).append(rec)
    return {"months": months, "climatology": climatology}
```

- [ ] **Step 4: Run, verify PASS**

```bash
PYTHONIOENCODING=utf-8 /c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe -m pytest services/api/tests/test_stats_phase1.py -q
```
Expected: `7 passed, 2 skipped` (6 prior offline + 1 new = 7; smoke still gated).

- [ ] **Step 5: Append a smoke test** to `services/api/tests/test_stats_phase1.py` (after the existing `@smoke` block):

```python


@smoke
def test_smoke_weather_shape() -> None:
    r = _SMOKE.get("/api/stats/weather")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"months", "climatology"}
    for rec in body["months"][:1] + body["climatology"][:1]:
        assert {"year", "month", "temp_mean", "precip_sum", "soil_moist_mean"}.issubset(rec)
```

- [ ] **Step 6: Run full stats file**, expected `7 passed, 3 skipped` (or weather smoke passes if API live with data). Commit:

```bash
git add services/api/src/api/routes/stats.py services/api/tests/test_stats_phase1.py
git commit -m "feat(stats): GET /api/stats/weather"
```

---

## Task 4: api-client — weather fetcher + type

**Files:** Modify `packages/api-client/src/index.ts`

- [ ] **Step 1: Append** to the END of `packages/api-client/src/index.ts`:

```typescript


export interface StatsWeatherPoint {
  year: number;
  month: number;
  temp_mean: number | null;
  precip_sum: number | null;
  soil_moist_mean: number | null;
}

export interface StatsWeatherResponse {
  months: StatsWeatherPoint[];
  climatology: StatsWeatherPoint[];
}

export async function fetchStatsWeather(): Promise<StatsWeatherResponse> {
  const res = await fetch(`${API_BASE}/api/stats/weather`);
  if (!res.ok) throw new Error(`stats/weather ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: Typecheck**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && cd apps/web && npx tsc --noEmit && cd ../..
```
Expected: clean (exit 0, no output).

- [ ] **Step 3: Commit**

```bash
git add packages/api-client/src/index.ts
git commit -m "feat(stats): api-client — fetchStatsWeather"
```

---

## Task 5: Chart wrappers — BarChart + AreaChart

**Files:** Create `apps/web/src/components/stats/charts/BarChart.tsx`, `apps/web/src/components/stats/charts/AreaChart.tsx`

- [ ] **Step 1: Create `BarChart.tsx`** (Recharts-isolated, CSS-var themed, plain-data props):

```tsx
/**
 * BarChart — горизонтальный bar. Единственное (вместе с LineChart/
 * AreaChart) место, знающее про Recharts. Цвета только из CSS-vars,
 * чтобы Claude Design проход переодевал без правок логики.
 */
import {
  ResponsiveContainer,
  BarChart as RBarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export interface BarChartProps {
  data: Array<Record<string, number | string | null>>;
  categoryKey: string;
  valueKey: string;
  height?: number;
}

export function BarChart({ data, categoryKey, valueKey, height = 280 }: BarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RBarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid stroke="var(--rule)" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" stroke="var(--ink-faint)" fontSize="var(--fs-xs)" />
        <YAxis
          type="category"
          dataKey={categoryKey}
          stroke="var(--ink-faint)"
          fontSize="var(--fs-xs)"
          width={110}
        />
        <Tooltip
          contentStyle={{
            background: "var(--paper-rise)",
            border: "1px solid var(--rule)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--fs-xs)",
          }}
        />
        <Bar dataKey={valueKey} fill="var(--forest)" radius={[0, 4, 4, 0]} />
      </RBarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Create `AreaChart.tsx`** (stacked area for the seasonal pulse):

```tsx
/**
 * AreaChart — стэк площадей по сериям. Recharts изолирован здесь;
 * цвета берём из переданного массива CSS-var-имён (Claude Design
 * проход меняет токены, не этот файл).
 */
import {
  ResponsiveContainer,
  AreaChart as RAreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

export interface AreaSeries {
  key: string;
  label: string;
  /** CSS-var color, e.g. "var(--idx-3)" */
  color: string;
}

export interface AreaChartProps {
  data: Array<Record<string, number | string | null>>;
  xKey: string;
  series: AreaSeries[];
  height?: number;
}

export function AreaChart({ data, xKey, series, height = 300 }: AreaChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RAreaChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="var(--rule)" strokeDasharray="3 3" />
        <XAxis dataKey={xKey} stroke="var(--ink-faint)" fontSize="var(--fs-xs)" />
        <YAxis stroke="var(--ink-faint)" fontSize="var(--fs-xs)" />
        <Tooltip
          contentStyle={{
            background: "var(--paper-rise)",
            border: "1px solid var(--rule)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--fs-xs)",
          }}
        />
        <Legend wrapperStyle={{ fontSize: "var(--fs-xs)" }} />
        {series.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stackId="1"
            stroke={s.color}
            fill={s.color}
            fillOpacity={0.55}
          />
        ))}
      </RAreaChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && cd apps/web && npx tsc --noEmit && cd ../..
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/stats/charts/BarChart.tsx apps/web/src/components/stats/charts/AreaChart.tsx
git commit -m "feat(stats): chart-обёртки BarChart + AreaChart"
```

---

## Task 6: Widget — KpiStrip

**Files:** Create `apps/web/src/components/stats/KpiStrip.tsx` + `.module.css`

- [ ] **Step 1: Create `KpiStrip.module.css`**

```css
.strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--space-3);
  margin: var(--space-5) 0;
}
.card {
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: var(--paper-rise);
  padding: var(--space-4);
}
.value {
  font-family: var(--font-display);
  font-size: var(--fs-h2);
  color: var(--ink);
  line-height: 1.1;
}
.label {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-faint);
  margin-top: var(--space-2);
}
```

- [ ] **Step 2: Create `KpiStrip.tsx`** (presentational — receives plain numbers):

```tsx
/** KpiStrip — карточки ключевых чисел. Данные приходят пропсами
 *  (страница их фетчит). Никакого fetch здесь. */
import styles from "./KpiStrip.module.css";

export interface KpiItem {
  label: string;
  value: string;
}

export function KpiStrip({ items }: { items: KpiItem[] }) {
  return (
    <div className={styles.strip}>
      {items.map((it) => (
        <div key={it.label} className={styles.card}>
          <div className={styles.value}>{it.value}</div>
          <div className={styles.label}>{it.label}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && cd apps/web && npx tsc --noEmit && cd ../..
git add apps/web/src/components/stats/KpiStrip.tsx apps/web/src/components/stats/KpiStrip.module.css
git commit -m "feat(stats): widget KpiStrip"
```

---

## Task 7: Widget — TrendingSpecies

**Files:** Create `apps/web/src/components/stats/TrendingSpecies.tsx` + `.module.css`

- [ ] **Step 1: Create `TrendingSpecies.module.css`**

```css
.box { border: 1px solid var(--rule); border-radius: var(--radius-md); background: var(--paper-rise); padding: var(--space-4); }
.row { display: flex; align-items: baseline; gap: var(--space-3); padding: var(--space-2) 0; border-bottom: 1px solid var(--rule); }
.row:last-child { border-bottom: none; }
.name { flex: 1; color: var(--ink); }
.count { font-family: var(--font-mono); color: var(--ink-dim); }
.up { color: var(--forest); }
.down { color: var(--danger); }
.flat { color: var(--ink-faint); }
.empty { color: var(--ink-dim); }
```

- [ ] **Step 2: Create `TrendingSpecies.tsx`** (consumes the existing `SpeciesNowResponse` shape — `{items:[{label,post_count,pct,trend}]}`):

```tsx
/** «Сейчас собирают» — топ видов за окно. Пропсы из
 *  fetchSpeciesNow() (страница фетчит). */
import type { SpeciesNowResponse } from "@mushroom-map/api-client";
import styles from "./TrendingSpecies.module.css";

const ARROW: Record<string, string> = { up: "↑", down: "↓", flat: "→" };

export function TrendingSpecies({ data }: { data: SpeciesNowResponse | null }) {
  if (!data || data.items.length === 0) {
    return <div className={styles.box}><span className={styles.empty}>Пока нет свежих находок в окне.</span></div>;
  }
  return (
    <div className={styles.box}>
      {data.items.map((it) => {
        const tr = it.trend ?? "flat";
        return (
          <div key={it.species_key} className={styles.row}>
            <span className={styles.name}>{it.label}</span>
            <span className={styles.count}>{it.post_count} ({it.pct}%)</span>
            <span className={styles[tr as "up" | "down" | "flat"]}>{ARROW[tr] ?? "→"}</span>
          </div>
        );
      })}
    </div>
  );
}
```

If `@mushroom-map/api-client` does not export `SpeciesNowResponse` (it may live in `@mushroom-map/types`), import it from `@mushroom-map/types` instead. Verify with: `grep -rn "SpeciesNowResponse" packages/` before writing — use whichever package actually exports it; the shape is `{ window_days:number; total_posts_in_window:number; items:{species_key:string;label:string;post_count:number;pct:number;trend:"up"|"down"|"flat"|null}[] }`.

- [ ] **Step 3: Typecheck + commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && cd apps/web && npx tsc --noEmit && cd ../..
git add apps/web/src/components/stats/TrendingSpecies.tsx apps/web/src/components/stats/TrendingSpecies.module.css
git commit -m "feat(stats): widget TrendingSpecies"
```

---

## Task 8: Widget — ForestComposition

**Files:** Create `apps/web/src/components/stats/ForestComposition.tsx` + `.module.css`

- [ ] **Step 1: Create `ForestComposition.module.css`**

```css
.box { border: 1px solid var(--rule); border-radius: var(--radius-md); background: var(--paper-rise); padding: var(--space-4); }
.tabs { display: flex; gap: var(--space-2); margin-bottom: var(--space-3); flex-wrap: wrap; }
.tab { font-family: var(--font-mono); font-size: var(--fs-xs); padding: var(--space-1) var(--space-3); border: 1px solid var(--rule); border-radius: 999px; background: transparent; color: var(--ink-dim); cursor: pointer; }
.tabActive { border-color: var(--forest); background: var(--forest); color: #fff; }
.empty { color: var(--ink-dim); }
```

- [ ] **Step 2: Create `ForestComposition.tsx`** (own dimension state; fetches via the api-client per dimension — this is an interactive widget, so it owns its fetch; still no Recharts knowledge — uses the `BarChart` wrapper):

```tsx
/** Состав леса ЛО с переключателем измерения. Интерактивный — сам
 *  фетчит выбранное измерение через api-client. График — через
 *  BarChart-обёртку (Recharts тут не виден). */
import { useEffect, useState } from "react";
import {
  fetchStatsForest,
  type StatsForestDimension,
  type StatsForestResponse,
} from "@mushroom-map/api-client";
import { BarChart } from "./charts/BarChart";
import styles from "./ForestComposition.module.css";

const DIMS: Array<{ key: StatsForestDimension; label: string }> = [
  { key: "species", label: "порода" },
  { key: "bonitet", label: "бонитет" },
  { key: "age_group", label: "возраст" },
  { key: "source", label: "источник" },
];

export function ForestComposition() {
  const [dim, setDim] = useState<StatsForestDimension>("species");
  const [data, setData] = useState<StatsForestResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStatsForest(dim)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setData({ dimension: dim, items: [] }));
    return () => { cancelled = true; };
  }, [dim]);

  const rows = (data?.items ?? []).map((i) => ({ name: i.label, km2: i.area_km2 }));

  return (
    <div className={styles.box}>
      <div className={styles.tabs}>
        {DIMS.map((d) => (
          <button
            key={d.key}
            className={`${styles.tab} ${dim === d.key ? styles.tabActive : ""}`}
            onClick={() => setDim(d.key)}
            type="button"
          >
            {d.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <span className={styles.empty}>Нет данных.</span>
      ) : (
        <BarChart data={rows} categoryKey="name" valueKey="km2" />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && cd apps/web && npx tsc --noEmit && cd ../..
git add apps/web/src/components/stats/ForestComposition.tsx apps/web/src/components/stats/ForestComposition.module.css
git commit -m "feat(stats): widget ForestComposition"
```

---

## Task 9: Widget — SeasonPulse

**Files:** Create `apps/web/src/components/stats/SeasonPulse.tsx` + `.module.css`

- [ ] **Step 1: Create `SeasonPulse.module.css`**

```css
.box { border: 1px solid var(--rule); border-radius: var(--radius-md); background: var(--paper-rise); padding: var(--space-4); }
.head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-3); flex-wrap: wrap; }
.title { font-family: var(--font-display); font-size: var(--fs-h3); color: var(--ink); }
.years { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.yr { font-family: var(--font-mono); font-size: var(--fs-xs); padding: var(--space-1) var(--space-2); border: 1px solid var(--rule); border-radius: 999px; background: transparent; color: var(--ink-dim); cursor: pointer; }
.yrActive { border-color: var(--chanterelle); color: var(--chanterelle); }
.empty { color: var(--ink-dim); }
```

- [ ] **Step 2: Create `SeasonPulse.tsx`** (pivots the existing `/api/stats/vk/timeline` payload to week-of-year; one selectable year vs the rest as faint lines; uses `LineChart` wrapper via a multi-series variant — but `LineChart` is single-series, so render the selected year + climatology as two series with a small inline composition using `AreaChart` is overkill; instead aggregate to month-of-year totals for the selected year and show a `BarChart` by month — robust and readable). Data prop is fetched by the page:

```tsx
/** Сезонный пульс — суммарные находки по месяцам года, выбор года.
 *  Данные — payload /api/stats/vk/timeline (страница фетчит). */
import { useMemo, useState } from "react";
import type { StatsTimelineResponse } from "@mushroom-map/api-client";
import { BarChart } from "./charts/BarChart";
import styles from "./SeasonPulse.module.css";

const MONTHS = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];

export function SeasonPulse({ data }: { data: StatsTimelineResponse | null }) {
  const byYear = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const p of data?.items ?? []) {
      if (!p.bucket) continue;
      const d = new Date(p.bucket);
      const y = d.getUTCFullYear();
      const mo = d.getUTCMonth();
      if (!m.has(y)) m.set(y, new Array(12).fill(0));
      m.get(y)![mo] += p.find_count;
    }
    return m;
  }, [data]);

  const years = useMemo(() => Array.from(byYear.keys()).sort((a, b) => b - a), [byYear]);
  const [year, setYear] = useState<number | null>(null);
  const activeYear = year ?? years[0] ?? null;

  if (years.length === 0) {
    return <div className={styles.box}><span className={styles.empty}>Нет данных активности.</span></div>;
  }
  const series = (byYear.get(activeYear!) ?? new Array(12).fill(0)).map((v, i) => ({
    name: MONTHS[i],
    finds: v,
  }));

  return (
    <div className={styles.box}>
      <div className={styles.head}>
        <span className={styles.title}>Сезонный пульс · {activeYear}</span>
        <div className={styles.years}>
          {years.slice(0, 8).map((y) => (
            <button
              key={y}
              type="button"
              className={`${styles.yr} ${y === activeYear ? styles.yrActive : ""}`}
              onClick={() => setYear(y)}
            >
              {y}
            </button>
          ))}
        </div>
      </div>
      <BarChart data={series} categoryKey="name" valueKey="finds" height={260} />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && cd apps/web && npx tsc --noEmit && cd ../..
git add apps/web/src/components/stats/SeasonPulse.tsx apps/web/src/components/stats/SeasonPulse.module.css
git commit -m "feat(stats): widget SeasonPulse"
```

---

## Task 10: Widget — SpeciesLeaderboardMini

**Files:** Create `apps/web/src/components/stats/SpeciesLeaderboardMini.tsx` + `.module.css`

- [ ] **Step 1: Create `SpeciesLeaderboardMini.module.css`**

```css
.box { border: 1px solid var(--rule); border-radius: var(--radius-md); background: var(--paper-rise); padding: var(--space-4); }
.row { display: flex; align-items: baseline; gap: var(--space-3); padding: var(--space-2) 0; border-bottom: 1px solid var(--rule); }
.row:last-child { border-bottom: none; }
.rank { font-family: var(--font-mono); color: var(--ink-faint); width: 1.6em; }
.name { flex: 1; color: var(--ink); }
.count { font-family: var(--font-mono); color: var(--ink-dim); }
.empty { color: var(--ink-dim); }
```

- [ ] **Step 2: Create `SpeciesLeaderboardMini.tsx`** (consumes `StatsCorpusResponse.classification`):

```tsx
/** Топ видов по находкам (из corpus.classification). Пропсы —
 *  страница фетчит /api/stats/corpus. */
import type { StatsCorpusResponse } from "@mushroom-map/api-client";
import styles from "./SpeciesLeaderboardMini.module.css";

export function SpeciesLeaderboardMini({
  data,
  limit = 8,
}: { data: StatsCorpusResponse | null; limit?: number }) {
  const items = (data?.classification ?? []).slice(0, limit);
  if (items.length === 0) {
    return <div className={styles.box}><span className={styles.empty}>Нет данных классификации.</span></div>;
  }
  return (
    <div className={styles.box}>
      {items.map((it, i) => (
        <div key={it.species_key} className={styles.row}>
          <span className={styles.rank}>{i + 1}</span>
          <span className={styles.name}>{it.label}</span>
          <span className={styles.count}>{it.count.toLocaleString("ru-RU")}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && cd apps/web && npx tsc --noEmit && cd ../..
git add apps/web/src/components/stats/SpeciesLeaderboardMini.tsx apps/web/src/components/stats/SpeciesLeaderboardMini.module.css
git commit -m "feat(stats): widget SpeciesLeaderboardMini"
```

---

## Task 11: Widget — WeatherSnapshot

**Files:** Create `apps/web/src/components/stats/WeatherSnapshot.tsx` + `.module.css`

- [ ] **Step 1: Create `WeatherSnapshot.module.css`**

```css
.box { border: 1px solid var(--rule); border-radius: var(--radius-md); background: var(--paper-rise); padding: var(--space-4); }
.title { font-family: var(--font-display); font-size: var(--fs-h3); color: var(--ink); margin-bottom: var(--space-3); }
.empty { color: var(--ink-dim); }
```

- [ ] **Step 2: Create `WeatherSnapshot.tsx`** (latest available year monthly temp vs climatology; `LineChart` wrapper — single series temp; precip as a second `BarChart` is optional, keep one chart for Phase 2):

```tsx
/** Погода ЛО: средняя температура по месяцам — последний доступный
 *  год. Данные из /api/stats/weather (страница фетчит). Пусто, если
 *  forecast.* отсутствует. */
import { useMemo } from "react";
import type { StatsWeatherResponse } from "@mushroom-map/api-client";
import { LineChart } from "./charts/LineChart";
import styles from "./WeatherSnapshot.module.css";

const MONTHS = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];

export function WeatherSnapshot({ data }: { data: StatsWeatherResponse | null }) {
  const series = useMemo(() => {
    const months = data?.months ?? [];
    if (months.length === 0) return [];
    const latest = Math.max(...months.map((m) => m.year));
    return months
      .filter((m) => m.year === latest)
      .sort((a, b) => a.month - b.month)
      .map((m) => ({ name: MONTHS[m.month - 1] ?? String(m.month), temp: m.temp_mean ?? 0 }));
  }, [data]);

  if (series.length === 0) {
    return (
      <div className={styles.box}>
        <div className={styles.title}>Погода</div>
        <span className={styles.empty}>Данные погоды появятся после синхронизации forecast-репозитория.</span>
      </div>
    );
  }
  return (
    <div className={styles.box}>
      <div className={styles.title}>Средняя температура по месяцам</div>
      <LineChart data={series} xKey="name" yKey="temp" height={220} />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && cd apps/web && npx tsc --noEmit && cd ../..
git add apps/web/src/components/stats/WeatherSnapshot.tsx apps/web/src/components/stats/WeatherSnapshot.module.css
git commit -m "feat(stats): widget WeatherSnapshot"
```

---

## Task 12: StatsHubPage — compose the dashboard

**Files:** Modify `apps/web/src/routes/stats/StatsHubPage.tsx`, `apps/web/src/routes/stats/StatsHubPage.module.css`

- [ ] **Step 1: Replace `StatsHubPage.module.css`** entirely with:

```css
.header { margin-bottom: var(--space-5); }
.eyebrow { font-family: var(--font-mono); font-size: var(--fs-xs); letter-spacing: 0.16em; text-transform: uppercase; color: var(--moss); margin: 0 0 var(--space-2); }
.freshness { font-family: var(--font-mono); font-size: var(--fs-xs); color: var(--ink-faint); margin-top: var(--space-3); }
.grid { display: grid; grid-template-columns: 2fr 1fr; gap: var(--space-5); align-items: start; }
.full { grid-column: 1 / -1; }
.sectionTitle { font-family: var(--font-display); font-size: var(--fs-h3); color: var(--ink); margin: var(--space-5) 0 var(--space-3); }
@media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
```

- [ ] **Step 2: Replace `StatsHubPage.tsx`** entirely with:

```tsx
/**
 * /stats — overview-хаб (Phase 2). Страница фетчит все эндпоинты и
 * раздаёт готовые данные презентационным виджетам (контракт для
 * Claude Design прохода: логика тут, презентация в виджетах).
 */
import { useEffect, useState } from "react";
import {
  fetchStatsMeta, fetchStatsCorpus, fetchSpeciesNow,
  fetchStatsTimeline, fetchStatsWeather,
  type StatsMeta, type StatsCorpusResponse, type SpeciesNowResponse,
  type StatsTimelineResponse, type StatsWeatherResponse,
} from "@mushroom-map/api-client";
import { Container } from "../../components/layout/Container";
import { usePageTitle } from "../../lib/usePageTitle";
import { KpiStrip, type KpiItem } from "../../components/stats/KpiStrip";
import { TrendingSpecies } from "../../components/stats/TrendingSpecies";
import { ForestComposition } from "../../components/stats/ForestComposition";
import { SeasonPulse } from "../../components/stats/SeasonPulse";
import { SpeciesLeaderboardMini } from "../../components/stats/SpeciesLeaderboardMini";
import { WeatherSnapshot } from "../../components/stats/WeatherSnapshot";
import styles from "./StatsHubPage.module.css";
import prose from "../Prose.module.css";

function num(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n).toLocaleString("ru-RU") : "—";
}

export function StatsHubPage() {
  usePageTitle("Статистика — Geobiom", "Интерактивная статистика по лесам, грибным находкам, погоде и AI-классификации Ленобласти.");

  const [meta, setMeta] = useState<StatsMeta | null>(null);
  const [corpus, setCorpus] = useState<StatsCorpusResponse | null>(null);
  const [now, setNow] = useState<SpeciesNowResponse | null>(null);
  const [timeline, setTimeline] = useState<StatsTimelineResponse | null>(null);
  const [weather, setWeather] = useState<StatsWeatherResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      fetchStatsMeta(), fetchStatsCorpus(), fetchSpeciesNow("30d", 6),
      fetchStatsTimeline("all", 5000), fetchStatsWeather(),
    ]).then((r) => {
      if (cancelled) return;
      if (r[0].status === "fulfilled") setMeta(r[0].value);
      if (r[1].status === "fulfilled") setCorpus(r[1].value);
      if (r[2].status === "fulfilled") setNow(r[2].value);
      if (r[3].status === "fulfilled") setTimeline(r[3].value);
      if (r[4].status === "fulfilled") setWeather(r[4].value);
      if (r.every((x) => x.status === "rejected")) setError("Не удалось загрузить статистику");
    });
    return () => { cancelled = true; };
  }, []);

  const m = corpus?.metrics ?? {};
  const kpis: KpiItem[] = [
    { label: "выделов леса", value: num(m["forest_polygon_count"]) },
    { label: "км² леса", value: num(m["forest_area_km2"]) },
    { label: "видов", value: num(m["species_count"]) },
    { label: "районов", value: num(m["district_count"]) },
    { label: "VK-постов", value: num(m["posts_total"]) },
    { label: "классифицировано", value: num(m["posts_classified"]) },
  ];

  return (
    <Container as="section" size="wide">
      <header className={styles.header}>
        <p className={styles.eyebrow}>Данные проекта</p>
        <h1 className={prose.h1}>Статистика</h1>
        <p className={prose.lead}>
          Лес, грибные находки, погода и AI-классификация Ленобласти — по цифрам.
        </p>
        {error && <p className={prose.p} style={{ color: "var(--danger)" }}>{error}</p>}
        {meta && (
          <p className={styles.freshness}>
            {meta.generated_at
              ? `данные на ${new Date(meta.generated_at).toLocaleDateString("ru-RU")}`
              : "snapshot ещё не сформирован"}
          </p>
        )}
      </header>

      <KpiStrip items={kpis} />

      <div className={styles.full}>
        <SeasonPulse data={timeline} />
      </div>

      <div className={styles.grid}>
        <ForestComposition />
        <div>
          <h2 className={styles.sectionTitle}>Сейчас собирают</h2>
          <TrendingSpecies data={now} />
          <h2 className={styles.sectionTitle}>Топ видов</h2>
          <SpeciesLeaderboardMini data={corpus} />
        </div>
      </div>

      <div className={styles.full}>
        <h2 className={styles.sectionTitle}>Погода</h2>
        <WeatherSnapshot data={weather} />
      </div>
    </Container>
  );
}
```

If `@mushroom-map/api-client` does not export `SpeciesNowResponse`, import that one type from `@mushroom-map/types` (see Task 7 note); all other types are exported from api-client (added in Phase 1 / Task 4).

- [ ] **Step 3: Typecheck + build**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && cd apps/web && npx tsc --noEmit && npm run build && cd ../..
```
Expected: tsc clean; build succeeds; `StatsHubPage` chunk now pulls Recharts (it renders charts) — confirm Recharts is in the **StatsHubPage lazy chunk**, NOT the entry/index chunk.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/stats/StatsHubPage.tsx apps/web/src/routes/stats/StatsHubPage.module.css
git commit -m "feat(stats): overview-хаб — KPI + сезонный пульс + состав + тренды + погода"
```

---

## Task 13: Docs — widened forecast.* read contract

**Files:** Modify `CLAUDE.md`

- [ ] **Step 1:** In `CLAUDE.md`, find the one-line-summary block that says mushroom-map "только читает `forecast.prediction`". Replace that sentence so it reads:

> mushroom-map читает `forecast.*` **только read-only** (`forecast.prediction`, `forecast.weather_daily`, `forecast.district_features`, `forecast.group` — для `/api/forecast/*` и snapshot раздела «Статистика»; всегда под `to_regclass`-guard, схема сестринская и может отсутствовать в CI). В `forecast.*` и в `public.*` сестринского репо НЕ пишем — двусторонний контракт.

(Match the surrounding wording/format; change only the contract sentence. If the exact sentence differs, edit the sentence that states the forecast read scope — keep it one coherent paragraph.)

- [ ] **Step 2:** In `CLAUDE.md`, in the section listing routes/IA, add one line under the routes block:

> `/stats` → overview-хаб раздела «Статистика» (KPI, сезонный пульс, состав леса, тренды, погода). Snapshot `public.stats_*` ← `pipelines/build_stats_snapshot.py`. Профили района/вида — Phase 3.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(stats): расширенный read-контракт forecast.* + /stats хаб в IA"
```

---

## Task 14: Phase-2 verification gate

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

```bash
PYTHONIOENCODING=utf-8 /c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe -m pytest -q
```
Expected: all green (prior 254 + new pipeline/weather tests), only the pre-existing docker-gated smokes skipped. No failures.

- [ ] **Step 2: Typecheck + build**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && cd apps/web && npx tsc --noEmit && npm run build && cd ../..
```
Expected: clean tsc; build OK; Recharts confined to the `/stats` lazy chunk (grep the entry chunk in `apps/web/dist/assets/` for `recharts` — expect absent).

- [ ] **Step 3: Endpoint smoke (API must be up — controller-run)**

```bash
for p in "/api/stats/corpus" "/api/stats/weather" "/api/stats/vk/timeline?group=all&limit=5"; do echo "-- $p"; curl -s "http://127.0.0.1:8000$p" | head -c 200; echo; done
```
Expected: each 200 with JSON; corpus has `species_count`/`district_count` in `metrics`; weather has `{months,climatology}` (arrays may be empty if forecast.* absent — acceptable).

- [ ] **Step 4: Visual self-check (controller, Playwright headless)** — load `/stats`, confirm KPI strip renders 6 cards with real numbers, SeasonPulse bar chart renders, ForestComposition tabs switch, no console errors. Screenshot and read it. Do not claim done without reading the screenshot.

- [ ] **Step 5: Final marker commit**

```bash
git commit --allow-empty -m "chore(stats): Phase 2 overview hub complete"
```

---

## Self-Review

**1. Spec coverage:** Hub widgets from the spec — KPI strip ✔ (Task 6/12), Сезонный пульс ✔ (Task 9), Сейчас собирают ✔ (Task 7, reuses existing `/vk/species-now`), Лес в цифрах ✔ (Task 8), мини-лидерборд ✔ (Task 10, species — district leaderboard explicitly deferred to Phase 3 where district profiles exist), погода-снэпшот ✔ (Tasks 1–3, 11). forecast.* read widened + documented ✔ (Tasks 2, 13). Free-tier discipline preserved — all aggregates precomputed; the only forecast scan is the offline guarded pipeline step ✔.

**2. Placeholder scan:** No TBD/“handle errors”. The two `grep`-to-confirm-export notes (Tasks 7, 12 — `SpeciesNowResponse` location) and the column-name-verify (Task 2 Step 3) are concrete verification instructions with explicit fallbacks/BLOCKED criteria, not vague placeholders. `043` migration number stated explicitly; Phase 3 reassigned to `044`.

**3. Type consistency:** `StatsWeatherResponse`/`StatsWeatherPoint` (Task 4) match the `/weather` JSON (Task 3) and `WeatherSnapshot` props (Task 11). `StatsForestResponse`/`StatsForestDimension`, `StatsCorpusResponse`, `StatsTimelineResponse`, `StatsMeta` are Phase-1 api-client exports reused unchanged. `KpiItem` defined in Task 6, imported in Task 12. Chart wrappers (`BarChart`/`AreaChart`/`LineChart`) props match every call site. `_FORECAST_GUARDED` + `run()` rewrite (Task 2) consistent with `SNAPSHOT_STEPS`. corpus `metrics` is `Record<string,number|string|null>` so `species_count`/`district_count` need no type change.

No issues outstanding.
