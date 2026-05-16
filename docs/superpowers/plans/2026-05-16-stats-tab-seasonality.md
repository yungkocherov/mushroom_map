# «Статистика» — Tab-shell + вкладка «Сезонность» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Restructure `/stats` into a tabbed explorer (Обзор · Сезонность · Лес · Погода) and fully build the **Сезонность** tab — ~20 skill-validated phenology charts over the VK foraging corpus.

**Architecture:** Reuse the Phase-1/2 precomputed-snapshot model. The whole tab is fed by **one rich spine table** (`stats_season_week`: species×year×ISO-week → posts/finds) plus a climatology/norm table (`stats_season_norm`) and a gated per-species summary (`stats_season_species`). Two thin read endpoints serve those; the React page fetches them once and a **chart registry** derives every chart client-side (DRY — no 20 bespoke backend queries, free-tier safe; heavy `jsonb` unnest only in the offline pipeline). Charts stay isolated behind `components/stats/charts/*` (CSS-var themed) for the later Claude Design pass.

**Tech Stack:** PostgreSQL/PostGIS, psycopg3, FastAPI, pytest, React 18 + react-router 7 (lazy), Recharts, TypeScript, Vite.

**Spec:** `docs/superpowers/specs/2026-05-16-stats-section-design.md` (revised live: tabbed explorer, no profiles/leaderboards/dotabuff). Phases 1+2 shipped on branch `claude/upbeat-archimedes-da0d9c` (migration 042/043, `pipelines/build_stats_snapshot.py`, `/api/stats/{meta,forest,vk/timeline,corpus,weather}`, api-client fetchers, chart wrappers `Line/Bar/Area`). Next migration number = **044**.

---

## Environment (every command assumes these)

- **cwd:** `C:/Users/ikoch/mushroom-map/.claude/worktrees/upbeat-archimedes-da0d9c`
- **Python:** `/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe`; prefix non-ASCII-printing with `PYTHONIOENCODING=utf-8`.
- **DB DSN (dev):** `postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map` (port 5434). **Requires Docker Desktop + `mushroom_db` up.**
- **Node on PATH before npm/npx:** `export PATH="/c/Program Files/nodejs:$PATH"`. node_modules installed.
- **psycopg3 `%` trap:** pipeline SQL (no params) must be `%`-free; endpoint SQL uses real `%s` WITH a params tuple.
- **forecast.* not used in this tab** (Сезонность is pure `public.vk_post`). No cross-repo concern here.
- **No prod deploy.** Branch commits only; no `git push`.
- **Dev runtime:** worktree API `uvicorn api.main:app --host 127.0.0.1 --port 8000 --reload --reload-dir services/api/src` (PYTHONPATH=services/api/src, DATABASE_URL=dev DSN); web `npm run dev --workspace=@mushroom-map/web` (proxies /api → :8000). Vite may land on :5173/5174 — read the dev log for the actual port.

---

## Task 1: DATA-FEASIBILITY GATE (run FIRST, when DB is up)

This is the user's explicit "проверь как идеи ложатся на данные" step. It produces the **parameters block** every later data task references. **No code is finalized before this passes.**

**Files:** Create `docs/superpowers/notes/2026-05-16-seasonality-data-audit.md` (findings record).

- [ ] **Step 1: Run the audit** (read-only). Create `scripts/_season_audit.py`:

```python
"""Read-only feasibility audit for the Сезонность tab. Not a pipeline."""
import psycopg
DSN = "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map"
c = psycopg.connect(DSN)
q = c.execute
tot = q("SELECT count(*) FROM vk_post").fetchone()[0]
cls = q("SELECT count(*) FROM vk_post WHERE photo_species IS NOT NULL "
        "AND jsonb_array_length(photo_species)>0").fetchone()[0]
foray = q("SELECT round(100.0*count(*) FILTER (WHERE foray_date IS NOT NULL)"
          "/NULLIF(count(*),0),1) FROM vk_post WHERE photo_species IS NOT NULL").fetchone()[0]
span = q("SELECT min(d),max(d) FROM (SELECT COALESCE(foray_date,"
         "(date_ts AT TIME ZONE 'Europe/Moscow')::date) d FROM vk_post "
         "WHERE photo_species IS NOT NULL) t WHERE d IS NOT NULL").fetchone()
per_year = q("SELECT EXTRACT(YEAR FROM COALESCE(foray_date,"
             "(date_ts AT TIME ZONE 'Europe/Moscow')::date))::int y,count(*) n "
             "FROM vk_post WHERE photo_species IS NOT NULL AND COALESCE(foray_date,"
             "(date_ts AT TIME ZONE 'Europe/Moscow')::date) IS NOT NULL "
             "GROUP BY 1 ORDER BY 1").fetchall()
sp = q("""
  WITH e AS (
    SELECT (s->>'species')::text sk,
      EXTRACT(YEAR FROM COALESCE(foray_date,
        (date_ts AT TIME ZONE 'Europe/Moscow')::date))::int y, v.id pid
    FROM vk_post v, LATERAL jsonb_array_elements(v.photo_species) s
    WHERE v.photo_species IS NOT NULL AND s->>'species' IS NOT NULL
      AND s->>'species'<>'other' AND COALESCE(foray_date,
        (date_ts AT TIME ZONE 'Europe/Moscow')::date) IS NOT NULL),
  py AS (SELECT sk,y,count(DISTINCT pid) n FROM e GROUP BY sk,y)
  SELECT sk, sum(n)::int posts, count(*) yrs,
    count(*) FILTER (WHERE n>=20) yrs20,
    count(*) FILTER (WHERE n>=50) yrs50
  FROM py GROUP BY sk ORDER BY posts DESC""").fetchall()
print("total",tot,"classified",cls,"foray_pct",foray)
print("span",str(span[0]),"->",str(span[1]))
print("per_year",[(y,n) for y,n in per_year])
print("species sk/posts/yrs/yrs>=20/yrs>=50")
for r in sp: print(" ",*r)
```
Run: `PYTHONIOENCODING=utf-8 /c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe scripts/_season_audit.py`

- [ ] **Step 2: Record findings + derive parameters** into `docs/superpowers/notes/2026-05-16-seasonality-data-audit.md`. Decide and write down concrete values:
  - `SEASON_GROUP_KEYS`: the ≤8 species/groups for the 100%-stacked-composition (idea 6) — top by `posts`, rest folded to `other`.
  - `PEAK_QUALIFY`: a species "qualifies" for peak/stability/trend (ideas 7,8,10,18,23,24) iff `posts >= PEAK_MIN_POSTS` AND `yrs20 >= PEAK_MIN_YEARS`. Set `PEAK_MIN_POSTS` and `PEAK_MIN_YEARS` from the audit so ≥4 species qualify but none with <~8 robust years slips in (e.g. start `PEAK_MIN_POSTS=300`, `PEAK_MIN_YEARS=6`; adjust to the real distribution).
  - `TREND_MIN_YEARS`: minimum qualifying years to show a peak/length **trend** line (ideas 23,24) — e.g. ≥8; fewer → show scatter only, no fitted slope.
  - `YEAR_MIN`: earliest year with enough total volume to include in cross-year charts (drop ultra-sparse early years from heatmap/ranking to avoid noise stripes).
  - Note the corpus-growth magnitude (per_year) → confirms ideas 16/25 must be **normalized**, absolute-volume ranking annotated as corpus-affected.
  - If any of ideas 1–25 is infeasible (e.g. a species has data in only 2 years) — explicitly mark it pruned/demoted here with reason.
- [ ] **Step 3: Commit the audit note**

```bash
git add scripts/_season_audit.py docs/superpowers/notes/2026-05-16-seasonality-data-audit.md
git commit -m "chore(stats): сезонность — data-feasibility audit + параметры gating"
```

> Tasks 3–6 below reference `SEASON_GROUP_KEYS / PEAK_QUALIFY / PEAK_MIN_POSTS / PEAK_MIN_YEARS / TREND_MIN_YEARS / YEAR_MIN` — use the values fixed in Step 2.

---

## Task 2: Migration 044 — seasonality snapshot tables

**Files:** Create `db/migrations/044_stats_season.sql`

- [ ] **Step 1: Write** (zero `%`):

```sql
-- 2026-05-16: seasonality snapshot (раздел «Статистика», вкладка
-- «Сезонность», Phase 3). Spine = species x year x ISO-week.
-- Наполняется pipelines/build_stats_snapshot.py из vk_post
-- (photo_species, COALESCE(foray_date, date_ts MSK)). Только public.*.

CREATE TABLE IF NOT EXISTS stats_season_week (
    species_key  TEXT     NOT NULL,
    year         SMALLINT NOT NULL,
    week         SMALLINT NOT NULL CHECK (week BETWEEN 1 AND 53),
    posts        INTEGER  NOT NULL DEFAULT 0,
    finds        INTEGER  NOT NULL DEFAULT 0,
    PRIMARY KEY (species_key, year, week)
);
CREATE INDEX IF NOT EXISTS idx_season_week_yr ON stats_season_week (year, week);

-- Климат-норма по неделе (среднее по годам на 7д-сглаженной серии) +
-- IQR-полоса для ridgeline / «текущий vs норма» / аномалии.
CREATE TABLE IF NOT EXISTS stats_season_norm (
    species_key  TEXT     NOT NULL,
    week         SMALLINT NOT NULL CHECK (week BETWEEN 1 AND 53),
    finds_mean   DOUBLE PRECISION NOT NULL DEFAULT 0,
    finds_p25    DOUBLE PRECISION NOT NULL DEFAULT 0,
    finds_p75    DOUBLE PRECISION NOT NULL DEFAULT 0,
    PRIMARY KEY (species_key, week)
);

-- Gated per-species сводка (пик/стабильность/тренд). qualifies кодирует
-- data-feasibility gate из Task 1.
CREATE TABLE IF NOT EXISTS stats_season_species (
    species_key        TEXT PRIMARY KEY,
    total_posts        INTEGER NOT NULL DEFAULT 0,
    n_years            SMALLINT NOT NULL DEFAULT 0,
    n_years_qual       SMALLINT NOT NULL DEFAULT 0,
    peak_week_median   DOUBLE PRECISION,
    peak_week_iqr      DOUBLE PRECISION,
    peak_trend_slope   DOUBLE PRECISION,   -- weeks per year (OLS); NULL if < TREND_MIN_YEARS
    season_len_median  DOUBLE PRECISION,   -- weeks between 10% and 90% cumulative
    qualifies          BOOLEAN NOT NULL DEFAULT FALSE
);
```

- [ ] **Step 2: Apply** `PYTHONIOENCODING=utf-8 /c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe db/migrate.py --dsn "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map"` → `-> 044_stats_season.sql` / `Применено миграций: 1`.
- [ ] **Step 3: Verify** the 3 tables exist: `... -c "import psycopg;c=psycopg.connect('...');print(sorted(r[0] for r in c.execute(\"SELECT tablename FROM pg_tables WHERE tablename LIKE 'stats_season%'\").fetchall()))"` → `['stats_season_norm','stats_season_species','stats_season_week']`.
- [ ] **Step 4: Commit** `git add db/migrations/044_stats_season.sql && git commit -m "feat(stats): миграция 044 — seasonality snapshot tables"`

---

## Task 3: Pipeline — 3 seasonality steps

**Files:** Modify `pipelines/build_stats_snapshot.py`, `pipelines/tests/test_build_stats_snapshot.py`

- [ ] **Step 1:** In the test, extend the expected `SNAPSHOT_STEPS` table set to also include `"stats_season_week"`, `"stats_season_norm"`, `"stats_season_species"`. Run the pipeline test → FAIL (set mismatch).
- [ ] **Step 2:** Add three SQL constants after `_WEATHER_SQL` (all `%`-free). `_SEASON_WEEK_SQL`: from `vk_post` exploded by `jsonb_array_elements(photo_species)` (species<>'other'), `d = COALESCE(foray_date,(date_ts AT TIME ZONE 'Europe/Moscow')::date)`, `year=EXTRACT(YEAR FROM d)`, `week=EXTRACT(WEEK FROM d)` (ISO), filtered `year >= <YEAR_MIN>`; `posts=count(DISTINCT id)`, `finds=sum(COALESCE((s->>'count')::int,0))`; GROUP BY species_key,year,week.

```python
_SEASON_WEEK_SQL = """
    INSERT INTO stats_season_week (species_key, year, week, posts, finds)
    WITH e AS (
        SELECT (s->>'species')::text AS sk,
               COALESCE(v.foray_date,
                 (v.date_ts AT TIME ZONE 'Europe/Moscow')::date) AS d,
               v.id AS pid,
               COALESCE((s->>'count')::int, 0) AS cnt
        FROM vk_post v, LATERAL jsonb_array_elements(v.photo_species) s
        WHERE v.photo_species IS NOT NULL
          AND s->>'species' IS NOT NULL AND s->>'species' <> 'other'
    )
    SELECT sk,
           EXTRACT(YEAR FROM d)::smallint,
           EXTRACT(WEEK FROM d)::smallint,
           count(DISTINCT pid)::int,
           sum(cnt)::int
    FROM e
    WHERE d IS NOT NULL AND EXTRACT(YEAR FROM d) >= <YEAR_MIN>
    GROUP BY 1, 2, 3
"""
```

`_SEASON_NORm_SQL` — wait, name it `_SEASON_NORM_SQL`: per (species, week) mean and p25/p75 of the per-year weekly `finds`, computed on a 7-day-equivalent smoothed weekly series. Since weekly buckets already aggregate 7 days, the agreed "7-day smoothing" at week granularity = a 3-week centered moving average on the per-year weekly series before taking the cross-year mean/percentiles (removes single-week spikes). Implement the smoothing with a window function over `stats_season_week` (depends on Task-3 ordering: norm reads the just-filled `stats_season_week`, so the norm step must run AFTER the week step — keep that order in `SNAPSHOT_STEPS`).

```python
_SEASON_NORM_SQL = """
    INSERT INTO stats_season_norm (species_key, week, finds_mean, finds_p25, finds_p75)
    WITH sm AS (
        SELECT species_key, year, week,
               AVG(finds) OVER (
                 PARTITION BY species_key, year
                 ORDER BY week ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING
               ) AS f7
        FROM stats_season_week
        WHERE year BETWEEN 2018 AND 2025
    )
    SELECT species_key, week,
           AVG(f7),
           percentile_cont(0.25) WITHIN GROUP (ORDER BY f7),
           percentile_cont(0.75) WITHIN GROUP (ORDER BY f7)
    FROM sm
    GROUP BY species_key, week
"""
```

`_SEASON_SPECIES_SQL` — per-species gated summary. `total_posts`, `n_years`, `n_years_qual` (years with ≥`PEAK_MIN_POSTS`/year-equivalent — use posts/year ≥ a threshold derived in Task 1; here gate by `sum(posts)>=<PEAK_MIN_POSTS>` and `count(year with posts>=20)>=<PEAK_MIN_YEARS>`), `peak_week_median` = median over qualifying years of the argmax-week of the 3-week-smoothed weekly finds, `peak_week_iqr`, `peak_trend_slope` = `regr_slope(peak_week, year)` over qualifying years (NULL if `n_years_qual < <TREND_MIN_YEARS>`), `season_len_median` = median over qualifying years of (week at 90% cumulative − week at 10% cumulative), `qualifies` = the gate boolean.

```python
_SEASON_SPECIES_SQL = """
    INSERT INTO stats_season_species
      (species_key, total_posts, n_years, n_years_qual,
       peak_week_median, peak_week_iqr, peak_trend_slope,
       season_len_median, qualifies)
    WITH sm AS (
        SELECT species_key, year, week, posts, finds,
               AVG(finds) OVER (
                 PARTITION BY species_key, year
                 ORDER BY week ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING
               ) AS f7,
               SUM(finds) OVER (PARTITION BY species_key, year) AS yr_finds
        FROM stats_season_week
    ),
    yr AS (
        SELECT species_key, year,
               SUM(posts) AS yr_posts,
               (ARRAY_AGG(week ORDER BY f7 DESC))[1] AS peak_week,
               MIN(week) FILTER (
                 WHERE SUM(finds) OVER (PARTITION BY species_key, year
                                        ORDER BY week) >= 0.10 * MAX(yr_finds)
               ) AS w10,
               MIN(week) FILTER (
                 WHERE SUM(finds) OVER (PARTITION BY species_key, year
                                        ORDER BY week) >= 0.90 * MAX(yr_finds)
               ) AS w90
        FROM sm
        GROUP BY species_key, year
    ),
    agg AS (
        SELECT species_key,
               SUM(yr_posts)::int AS total_posts,
               COUNT(*) AS n_years,
               COUNT(*) FILTER (WHERE yr_posts >= 20) AS n_years_qual,
               percentile_cont(0.5)  WITHIN GROUP (ORDER BY peak_week)
                 FILTER (WHERE yr_posts >= 20) AS peak_week_median,
               (percentile_cont(0.75) WITHIN GROUP (ORDER BY peak_week)
                  FILTER (WHERE yr_posts >= 20))
               - (percentile_cont(0.25) WITHIN GROUP (ORDER BY peak_week)
                  FILTER (WHERE yr_posts >= 20)) AS peak_week_iqr,
               regr_slope(peak_week, year)
                 FILTER (WHERE yr_posts >= 20) AS slope_raw,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY (w90 - w10))
                 FILTER (WHERE yr_posts >= 20) AS season_len_median
        FROM yr
        GROUP BY species_key
    )
    SELECT species_key, total_posts, n_years, n_years_qual,
           peak_week_median, peak_week_iqr,
           CASE WHEN n_years_qual >= <TREND_MIN_YEARS> THEN slope_raw END,
           season_len_median,
           (total_posts >= <PEAK_MIN_POSTS> AND n_years_qual >= <PEAK_MIN_YEARS>)
    FROM agg
"""
```

> The window-function-inside-aggregate constructs above are intricate; if Postgres rejects a nested window/aggregate combination, split into an extra CTE (compute cumulative with a window in one CTE, aggregate in the next). The intent is fixed; the SQL shape may need a mechanical CTE split — that is allowed, the **semantics must not change**, and it must stay `%`-free.

Register all three in `SNAPSHOT_STEPS` (order: `stats_season_week` → `stats_season_norm` → `stats_season_species`; norm/species read the week table, so they must come after — and they are `public.*`, no forecast guard). Update `_FORECAST_GUARDED` unchanged.

- [ ] **Step 3:** Replace `<YEAR_MIN>/<PEAK_MIN_POSTS>/<PEAK_MIN_YEARS>/<TREND_MIN_YEARS>` with the literals fixed in Task 1 Step 2.
- [ ] **Step 4:** pytest pipeline test → `3 passed`. Run the pipeline; expect `-> stats_season_week: N`, `-> stats_season_norm: N`, `-> stats_season_species: N` (N>0) then `STATS_SNAPSHOT_DONE`. Spot-check: `SELECT species_key,total_posts,qualifies,peak_week_median FROM stats_season_species ORDER BY total_posts DESC` — top species `qualifies=true`, sensible peak weeks (porcini ≈ week 33–37, spring_mushroom ≈ week 18–20).
- [ ] **Step 5:** `git add pipelines/build_stats_snapshot.py pipelines/tests/test_build_stats_snapshot.py && git commit -m "feat(stats): seasonality snapshot steps (week/norm/species, gated)"`

---

## Task 4: API — 2 seasonality endpoints + tests

**Files:** Modify `services/api/src/api/routes/stats.py`, `services/api/tests/test_stats_phase1.py`

- [ ] **Step 1:** Append offline tests (FakeConn → empty 200 shape, query validation): `test_season_curves_empty_shape` (`/api/stats/season/curves` → `{"species":"all","weeks":[]}`), `test_season_species_empty_shape` (`/api/stats/season/species` → `{"items":[]}`), `test_season_curves_bad_species_ok` (unknown species → 200 empty, not 500). Run → FAIL (404).
- [ ] **Step 2:** Append endpoints to END of `stats.py`:

```python


@router.get("/season/curves")
def stats_season_curves(
    response: Response,
    species: str = Query("all", description="species_key или 'all'"),
    year: str = Query("all", description="'all' | csv годов | 'norm'"),
) -> dict:
    """Недельные серии по видам (spine stats_season_week) + норма
    (stats_season_norm). Всё остальное (S-кривые, heatmap, состав,
    аномалии) фронт считает из этого payload. Из snapshot — дёшево."""
    with get_conn() as conn:
        if species == "all":
            rows = conn.execute(
                "SELECT species_key, year, week, posts, finds "
                "FROM stats_season_week ORDER BY year, week, species_key"
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT species_key, year, week, posts, finds "
                "FROM stats_season_week WHERE species_key = %s "
                "ORDER BY year, week",
                (species,),
            ).fetchall()
        norm = conn.execute(
            "SELECT species_key, week, finds_mean, finds_p25, finds_p75 "
            "FROM stats_season_norm"
            + ("" if species == "all" else " WHERE species_key = %s"),
            () if species == "all" else (species,),
        ).fetchall()
    response.headers["Cache-Control"] = _STATS_CACHE
    weeks = [
        {"species_key": r[0], "year": int(r[1]), "week": int(r[2]),
         "posts": int(r[3]), "finds": int(r[4])}
        for r in rows
    ]
    norm_out = [
        {"species_key": n[0], "week": int(n[1]),
         "finds_mean": round(float(n[2]), 2),
         "finds_p25": round(float(n[3]), 2),
         "finds_p75": round(float(n[4]), 2)}
        for n in norm
    ]
    return {"species": species, "weeks": weeks, "norm": norm_out}


@router.get("/season/species")
def stats_season_species(response: Response) -> dict:
    """Gated per-species сводка (пик/стабильность/тренд/длина).
    Из snapshot. label через SPECIES_LABELS."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT species_key, total_posts, n_years, n_years_qual, "
            "peak_week_median, peak_week_iqr, peak_trend_slope, "
            "season_len_median, qualifies "
            "FROM stats_season_species ORDER BY total_posts DESC"
        ).fetchall()
    response.headers["Cache-Control"] = _STATS_CACHE
    items = [
        {
            "species_key": r[0],
            "label": SPECIES_LABELS.get(r[0], r[0]),
            "total_posts": int(r[1]),
            "n_years": int(r[2]),
            "n_years_qual": int(r[3]),
            "peak_week_median": None if r[4] is None else round(float(r[4]), 1),
            "peak_week_iqr": None if r[5] is None else round(float(r[5]), 1),
            "peak_trend_slope": None if r[6] is None else round(float(r[6]), 3),
            "season_len_median": None if r[7] is None else round(float(r[7]), 1),
            "qualifies": bool(r[8]),
        }
        for r in rows or []
    ]
    return {"items": items}
```

- [ ] **Step 3:** offline tests → PASS. Append `@smoke` tests hitting the live endpoints asserting shape + that the top species `qualifies` is `True`. Run full `test_stats_phase1.py`.
- [ ] **Step 4:** `git add services/api/src/api/routes/stats.py services/api/tests/test_stats_phase1.py && git commit -m "feat(stats): GET /api/stats/season/{curves,species}"`

---

## Task 5: api-client — seasonality fetchers + types

**Files:** Modify `packages/api-client/src/index.ts`

- [ ] **Step 1:** Append inline interfaces + fetchers (mirror existing pattern, reuse `API_BASE`):

```typescript


export interface SeasonWeekPoint { species_key: string; year: number; week: number; posts: number; finds: number; }
export interface SeasonNormPoint { species_key: string; week: number; finds_mean: number; finds_p25: number; finds_p75: number; }
export interface SeasonCurvesResponse { species: string; weeks: SeasonWeekPoint[]; norm: SeasonNormPoint[]; }
export interface SeasonSpeciesItem {
  species_key: string; label: string; total_posts: number;
  n_years: number; n_years_qual: number;
  peak_week_median: number | null; peak_week_iqr: number | null;
  peak_trend_slope: number | null; season_len_median: number | null;
  qualifies: boolean;
}
export interface SeasonSpeciesResponse { items: SeasonSpeciesItem[]; }

export async function fetchSeasonCurves(species = "all", year = "all"): Promise<SeasonCurvesResponse> {
  const u = `${API_BASE}/api/stats/season/curves?species=${encodeURIComponent(species)}&year=${encodeURIComponent(year)}`;
  const res = await fetch(u);
  if (!res.ok) throw new Error(`stats/season/curves ${res.status}`);
  return res.json();
}
export async function fetchSeasonSpecies(): Promise<SeasonSpeciesResponse> {
  const res = await fetch(`${API_BASE}/api/stats/season/species`);
  if (!res.ok) throw new Error(`stats/season/species ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2:** tsc clean. Commit `git add packages/api-client/src/index.ts && git commit -m "feat(stats): api-client — season fetchers"`

---

## Task 6: Tab-shell — `/stats` becomes tabbed

**Files:** Create `apps/web/src/routes/stats/StatsTabs.tsx` + `.module.css`; Modify `apps/web/src/router.tsx`, `apps/web/src/routes/stats/StatsHubPage.tsx`.

- [ ] **Step 1:** Create `StatsTabs.tsx` — a tab bar (token-styled, accessible `role="tablist"`) with tabs `Обзор | Сезонность | Лес | Погода`, driven by `?tab=` query param (default `obzor`), rendering the active tab's component. `Обзор` renders a placeholder «собирается из остальных вкладок — появится последним». `Лес`/`Погода` render «в работе». `Сезонность` renders `<SeasonalityTab/>` (Task 10).
- [ ] **Step 2:** `router.tsx`: the existing `{ path: "stats", element: <Suspense…><StatsHubPage/></Suspense> }` stays, but `StatsHubPage` now renders the header + `<StatsTabs/>`. (Keep one lazy chunk.) No new route needed (tabs via query param, no full reload).
- [ ] **Step 3:** Rewrite `StatsHubPage.tsx` to: page-shell header (eyebrow/H1/lead/freshness from `/api/stats/meta`) + `<StatsTabs/>`. Remove the Phase-2 single-page widget composition from `StatsHubPage` (the Phase-2 widgets move under the relevant tabs in later phases; for now Сезонность is the only filled tab; Обзор is intentionally empty per the user). Keep `usePageTitle`, `Container`.
- [ ] **Step 4:** tsc + build; confirm `/stats?tab=seasonality` renders the tab bar with Сезонность active. Commit `git add apps/web/src/routes/stats/StatsTabs.tsx apps/web/src/routes/stats/StatsTabs.module.css apps/web/src/router.tsx apps/web/src/routes/stats/StatsHubPage.tsx && git commit -m "feat(stats): tab-shell /stats (Обзор/Сезонность/Лес/Погода)"`

---

## Task 7: Chart wrappers needed by Сезонность

**Files:** Create `apps/web/src/components/stats/charts/{Heatmap,RangeBars,RidgeLines}.tsx`

Recharts has no native ridgeline/heatmap; implement these 3 as small **SVG** components (still the only place charts know their rendering; CSS-var themed; plain-data props) — `LineChart/BarChart/AreaChart` (Phase 2) cover the rest.

- [ ] **Step 1:** `Heatmap.tsx` — props `{rows:string[]; cols:(string|number)[]; values:number[][]; height?}`; renders a token-colored grid (sequential `--idx-0..--idx-4` ramp via value→bucket), hover title. ~70 lines SVG.
- [ ] **Step 2:** `RangeBars.tsx` — props `{items:{label:string;start:number;end:number;mark?:number}[]; min:number; max:number}` — horizontal "season bands" on a shared month axis (ideas 4). ~60 lines SVG.
- [ ] **Step 3:** `RidgeLines.tsx` — props `{series:{label:string;values:number[]}[]; xLabels:string[]}` — vertically stacked normalized area curves (idea 21). ~70 lines SVG.
- [ ] **Step 4:** tsc clean. Commit `git add apps/web/src/components/stats/charts/Heatmap.tsx apps/web/src/components/stats/charts/RangeBars.tsx apps/web/src/components/stats/charts/RidgeLines.tsx && git commit -m "feat(stats): chart-обёртки Heatmap/RangeBars/RidgeLines"`

---

## Task 8: Seasonality transforms (pure, unit-tested)

**Files:** Create `apps/web/src/components/stats/season/transforms.ts` + `transforms.test.ts` (vitest — `apps/web` has `vitest`).

All chart shaping from the 2 endpoints lives in pure functions (testable without a browser). One function per chart family: `smooth7(weekly)`, `yearCurves(weeks, species)`, `weekYearMatrix(weeks)`, `cumulativeShare(weeks,year)`, `compositionByWeek(weeks, GROUPS)`, `peakBoxData(speciesSummary)`, `seasonBands(speciesSummary)`, `ridgeDensity(norm)`, `yearRanking(weeks)`, `currentVsNorm(weeks,norm,year)`, `weeklyAnomaly(weeks,norm,year)`, `overlapMatrix(norm)`, `monthSpeciesShare(weeks)`.

- [ ] **Step 1:** Write `transforms.test.ts` first (vitest) with small synthetic inputs and exact expected outputs for each function (TDD). Run `npx vitest run src/components/stats/season/transforms.test.ts` → FAIL.
- [ ] **Step 2:** Implement `transforms.ts` (pure, typed against the api-client interfaces). Smoothing = centered rolling mean window 3 on the weekly series (week granularity ⇒ ≈7-day at this resolution, per the agreed smoothing).
- [ ] **Step 3:** vitest → PASS. Commit `git add apps/web/src/components/stats/season/transforms.ts apps/web/src/components/stats/season/transforms.test.ts && git commit -m "feat(stats): seasonality pure transforms + unit tests"`

---

## Task 9: Chart registry + Сезонность components

**Files:** Create `apps/web/src/components/stats/season/SeasonCharts.tsx` (+ `.module.css`) — the registry that maps each validated idea to {title, subtitle/insight, controls, transform, chart wrapper}.

The validated idea set (skill-vetted; ideas 19/20 dropped, 14 replaced, 6 grouped, 13 as heatmap, 7/8/10/18/23/24 gated, 16/25 normalized):

`SEASON_CHARTS` entries: (1) seasonal curve all/stacked, (2) per-species curve [species select], (3) week×year heatmap [all|species], (4) season bands all species, (5) cumulative S-curves, (6) 100%-stacked composition (≤8 groups), (7) peak box/IQR by species [qualifying only], (8) peak-week-by-year trend [qualifying], (9) season start by year, (10) season concentration (share in peak N weeks), (11) growth rate (derivative of smoothed), (12) species×species overlap heatmap, (13) month×species share heatmap, (14*) multi-year overlaid lines (replaces radial), (15) year ranking by weighted mean week, (16) season volume by year (normalized + corpus note), (17) this year vs norm band, (18) robust first-appearance by year [gated], (21) ridgeline density, (22) weekly anomaly vs norm [diverging], (23) phenology trend slope summary, (24) season-length trend, (25) good vs poor year normalized shape.

- [ ] **Step 1:** Implement each as a small presentational sub-component reading the relevant transform output; non-qualifying species greyed with «мало данных за …»; every chart has a one-line insight subtitle (skill: title states the finding). Controls (species/year selectors) lift state in `SeasonalityTab`.
- [ ] **Step 2:** tsc clean. Commit `git add apps/web/src/components/stats/season/SeasonCharts.tsx apps/web/src/components/stats/season/SeasonCharts.module.css && git commit -m "feat(stats): Сезонность — chart registry (23 vetted charts)"`

---

## Task 10: SeasonalityTab — compose + wire data

**Files:** Create `apps/web/src/routes/stats/SeasonalityTab.tsx` + `.module.css`

- [ ] **Step 1:** Fetch `fetchSeasonCurves("all")` + `fetchSeasonSpecies()` once (`Promise.allSettled`), hold species/year UI state, pass plain transformed data to the `SeasonCharts` registry; loading/empty/error states; section grouping (Форма / Пик / Сравнение / Год-к-году). Wire it into `StatsTabs` (Task 6) as the Сезонность tab body.
- [ ] **Step 2:** tsc + build; recharts/charts only in the lazy `/stats` chunk. Commit `git add apps/web/src/routes/stats/SeasonalityTab.tsx apps/web/src/routes/stats/SeasonalityTab.module.css && git commit -m "feat(stats): вкладка Сезонность (compose + data wiring)"`

---

## Task 11: MANDATORY visual self-QA of EVERY chart (user requirement)

> User instruction: "Когда сделаешь все графики — посмотри их глазами и найди проблемы, исправь." This is a blocking acceptance gate, not optional.

- [ ] **Step 1:** Bring up dev stack (API :8000 `--reload`, web dev). Snapshot must be built (Tasks 2–3 ran).
- [ ] **Step 2:** Playwright headless: navigate `/stats?tab=seasonality`, and for **each** chart in the registry — scroll it into view, screenshot it individually (or full-page tall screenshots covering all), `preview`/evaluate that the chart SVG has data (non-empty paths/rects), axis labels present, no overlapping/clipped labels, no empty-but-should-have-data panels, smoothing visibly applied (curves not jagged), gated charts correctly grey non-qualifying species, no console errors.
- [ ] **Step 3: Read every screenshot.** For each chart, judge: is it correct, readable, and does it actually say something? Record concrete defects (mislabeled axis, wrong scale, jagged unsmoothed series, unreadable category labels, empty series, misleading normalization, etc.).
- [ ] **Step 4: Fix every defect found** (iterate transform/component/chart-wrapper), re-screenshot, re-read — loop until every chart is correct and readable. Do not declare done on any chart not visually verified.
- [ ] **Step 5:** Full `pytest -q` + `tsc` + `build` green. Commit fixes; final marker `git commit --allow-empty -m "chore(stats): вкладка Сезонность — visual self-QA passed, all charts verified"`.

---

## Self-Review

**1. Spec/agreement coverage:** Tab-shell (Обзор empty, Сезонность/Лес/Погода) ✔ Task 6. All skill-validated seasonality ideas ✔ Task 9 registry (19/20 removed, 14 replaced, 6 grouped, 13 heatmap, peak/trend gated, 16/25 normalized — matches the skill-validation message). 7-day smoothing ✔ (Task 3 norm/species + Task 8 `smooth7`). User's data-feasibility step is **Task 1, first, gating** ✔. User's "look at every chart, fix" is **Task 11, mandatory blocking gate** ✔. Free-tier: heavy unnest only offline; endpoints O(rows) ✔. No prod/push ✔. No profiles/leaderboards/dotabuff ✔.

**2. Placeholder scan:** `<YEAR_MIN>/<PEAK_MIN_POSTS>/<PEAK_MIN_YEARS>/<TREND_MIN_YEARS>` are explicit Task-1-resolved parameters (the user's ordered process *requires* deriving them from data before code — this is a real gated checkpoint, not a vague placeholder), substituted in Task 3 Step 3. The "CTE split allowed if Postgres rejects nested window/aggregate" note is a concrete mechanical contingency with fixed semantics, not hand-waving. No "TBD/etc."

**3. Type consistency:** `Season{Week,Norm}Point`, `SeasonCurvesResponse`, `SeasonSpeciesItem/Response` (Task 5) match endpoint JSON (Task 4) and snapshot columns (Task 2). Pipeline step names == migration table names == test expectations. `transforms.ts` typed against the api-client interfaces. Chart wrappers' props match registry call sites.

**Blocker note:** Tasks 1–4, 10–11 need Docker + dev DB up. Authoring of this plan + Tasks 5–9 code can proceed DB-less, but the user's ordered process (data-check BEFORE finalizing data code) means Task 3 literals + Task 1 must complete before Tasks 2–4 land. Execution resumes when `mushroom_db` is reachable.
