# Погода (Weather) Stats Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the «Погода» tab of `/stats` — 20 cards over 8 years of per-district daily weather (`forecast.weather_daily`), covering the climatic cycle, inter-annual variability, season/trends, extremes, and per-district geography, as a mushroom-relevance structural context.

**Architecture:** Identical to the shipped «Лес» tab. Heavy SQL runs offline in `pipelines/build_stats_snapshot.py` → `public.stats_weather_*` tables → one thin parameter-less endpoint `/api/stats/weather/explore` → typed api-client fetcher → pure `transforms.ts` (vitest) → Recharts-isolated chart wrappers → `WeatherTab.tsx` compose. **Mirror the Лес files exactly** as the established pattern.

**Tech Stack:** Postgres/PostGIS, FastAPI, psycopg3, React, Recharts, Vite, vitest.

**Gating facts (from `docs/superpowers/notes/2026-05-17-weather-data-audit.md` — read it):**
- `forecast.weather_daily`: 18 districts × daily, 2018-01-01..2026-05-11. Full years **2018-2025**; **2026 is partial (to May 11)**.
- Baseline label is **«среднее 2018–2025»**, never «климат-норма» (8y < WMO 30y).
- `soil_moisture_*` is volumetric **m³/m³** (0–0.44), not %.
- LO-aggregate = simple mean across 18 districts. GDD base = 5 °C (state in caption).
- 8 data points per trend → **descriptive bars + baseline line, NEVER a fitted regression/slope/R²**.
- `forecast.*` is sister-repo owned, read-only, always under `to_regclass` guard. **Never write `forecast.*`.**
- psycopg3 `%` trap: snapshot SQL (`cur.execute(sql)`, no params) must be `%`-free; endpoint SQL uses real `%s`+params. Escape any literal `%` as `%%` is NOT available in no-param execute — avoid `%` entirely in snapshot SQL.

---

## File Structure

- Create `db/migrations/046_stats_weather_explore.sql` — 7 new `stats_weather_*` tables (the existing `stats_weather_monthly` from 043 is untouched; the `/weather` endpoint keeps working).
- Modify `pipelines/build_stats_snapshot.py` — add 7 `%`-free SQL constants + 7 `SNAPSHOT_STEPS` entries, all under the existing `_FORECAST_GUARDED` mechanism (skip if `forecast.weather_daily` absent).
- Modify `services/api/src/api/routes/stats.py` — add `GET /weather/explore` (7 param-less SELECTs, one response object).
- Modify `packages/api-client/src/index.ts` — add `Weather*Row` interfaces + `WeatherExploreResponse` + `fetchWeatherExplore()`.
- Create `apps/web/src/components/stats/weather/transforms.ts` + `transforms.test.ts` — pure functions, zero React/Recharts.
- Create `apps/web/src/components/stats/charts/DivergingBarChart.tsx` — the only missing wrapper (signed bars, +/- token colors).
- Create `apps/web/src/components/stats/weather/WeatherCharts.module.css` — verbatim copy of `forest/ForestCharts.module.css`.
- Create `apps/web/src/routes/stats/WeatherTab.tsx` — compose 20 cards / 5 sections.
- Modify `apps/web/src/routes/stats/StatsTabs.tsx` — replace the `weather` placeholder branch with `<WeatherTab />`.

## Snapshot schema (target)

| table | PK | columns |
|---|---|---|
| `stats_weather_clim` | `month` | `t_mean,t_min,t_max,precip,soil_moist,p_minus_et0` |
| `stats_weather_year` | `year` | `is_partial bool, t_mean,t_anom,precip_total,precip_anom,warm_days,warm_soil_moist,rainy_days_warm,snow_days,last_spring_frost_doy,first_autumn_frost_doy` |
| `stats_weather_ym` | `year,month` | `t_mean,precip_total` |
| `stats_weather_gdd` | `year,month` | `gdd5_cum` |
| `stats_weather_precip_hist` | `bin_lo` | `days` |
| `stats_weather_district` | `district_id` | `warm_precip,warm_soil_moist,mushroom_days` |
| `stats_weather_district_month` | `district_id,month` | `soil_moist,soil_temp` |

LO-aggregate tables average across districts first (per date) then aggregate, OR average districts within the period — spec per-SQL below. All clim/year/ym/gdd/hist tables use **full years 2018-2025 only** for the baseline; `stats_weather_year` additionally emits the partial 2026 row with `is_partial=true` (frontend drops it from bars).

## Card → chart map (20 cards, 5 sections)

S1 Климатический цикл (climatology 2018-2025):
1. Годовой ход температуры — `MultiLineChart` t_mean + band[t_min,t_max]
2. Годовой ход осадков — `BarChart` month→precip
3. Влажность почвы по месяцам — `LineChart` month→soil_moist (м³/м³)
4. Баланс осадков и испарения (P−ET0) — `LineChart` month→p_minus_et0

S2 Межгодовая изменчивость:
5. Аномалия среднегодовой T° — `DivergingBarChart` year→t_anom
6. Аномалия годовых осадков — `DivergingBarChart` year→precip_anom
7. Год × месяц: температура — `Heatmap`
8. Год × месяц: осадки — `Heatmap`

S3 Сезон и тренды (descriptive bars, no regression):
9. Длина тёплого сезона (T_сут ≥ 10 °C) — `BarChart` year→warm_days
10. Влажность почвы тёплого сезона (июн–сен) — `BarChart` year→warm_soil_moist
11. Дождливых дней за тёплый сезон — `BarChart` year→rainy_days_warm
12. Снежный покров, дней/год — `BarChart` year→snow_days
13. Накопленные GDD (база 5 °C) — `MultiLineChart`, one line per year over months
14. Безморозное окно — `RangeBars` year→[last_spring_frost_doy, first_autumn_frost_doy]

S4 Распределение:
15. Распределение суточных летних осадков — `BarChart` bin→days

S5 География (per-district climatology):
16. Осадки тёплого сезона по районам — `BarChart` district→warm_precip
17. Влажность почвы тёплого сезона по районам — `BarChart` district→warm_soil_moist
18. «Грибные дни» района — `BarChart` district→mushroom_days
19. Район × месяц: влажность почвы — `Heatmap` (18×12)
20. Район × месяц: температура почвы — `Heatmap` (18×12)

«Грибное окно» (audit idea 4) is intentionally NOT a dual-axis overlay (data-viz integrity: dual-axis implies false correlation). Its insight lives in captions of cards 1/3 + the derived card 18 `mushroom_days`.

---

### Task 1: Migration — 7 snapshot tables

**Files:** Create `db/migrations/046_stats_weather_explore.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 2026-05-17: stats «Погода» explore snapshot (раздел «Статистика»).
--
-- LO-агрегат + per-district погода из forecast.weather_daily
-- (сестринский репо, read-only, под to_regclass-guard в pipeline).
-- Мы НЕ пишем forecast.*. Полные годы 2018-2025 — базовая линия;
-- 2026 частичный (is_partial=true, фронт убирает из баров).
-- Существующий stats_weather_monthly (043) не трогаем.

CREATE TABLE IF NOT EXISTS stats_weather_clim (
    month         SMALLINT PRIMARY KEY CHECK (month BETWEEN 1 AND 12),
    t_mean        DOUBLE PRECISION,
    t_min         DOUBLE PRECISION,
    t_max         DOUBLE PRECISION,
    precip        DOUBLE PRECISION,
    soil_moist    DOUBLE PRECISION,
    p_minus_et0   DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS stats_weather_year (
    year                   SMALLINT PRIMARY KEY,
    is_partial             BOOLEAN NOT NULL DEFAULT FALSE,
    t_mean                 DOUBLE PRECISION,
    t_anom                 DOUBLE PRECISION,
    precip_total           DOUBLE PRECISION,
    precip_anom            DOUBLE PRECISION,
    warm_days              INTEGER,
    warm_soil_moist        DOUBLE PRECISION,
    rainy_days_warm        INTEGER,
    snow_days              INTEGER,
    last_spring_frost_doy  INTEGER,
    first_autumn_frost_doy INTEGER
);

CREATE TABLE IF NOT EXISTS stats_weather_ym (
    year          SMALLINT NOT NULL,
    month         SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    t_mean        DOUBLE PRECISION,
    precip_total  DOUBLE PRECISION,
    PRIMARY KEY (year, month)
);

CREATE TABLE IF NOT EXISTS stats_weather_gdd (
    year       SMALLINT NOT NULL,
    month      SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    gdd5_cum   DOUBLE PRECISION,
    PRIMARY KEY (year, month)
);

CREATE TABLE IF NOT EXISTS stats_weather_precip_hist (
    bin_lo  INTEGER PRIMARY KEY,   -- left edge, mm/day (open-ended top bin)
    days    INTEGER
);

CREATE TABLE IF NOT EXISTS stats_weather_district (
    district_id      INTEGER PRIMARY KEY,
    warm_precip      DOUBLE PRECISION,
    warm_soil_moist  DOUBLE PRECISION,
    mushroom_days    DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS stats_weather_district_month (
    district_id  INTEGER NOT NULL,
    month        SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    soil_moist   DOUBLE PRECISION,
    soil_temp    DOUBLE PRECISION,
    PRIMARY KEY (district_id, month)
);
```

- [ ] **Step 2: Apply** — Run: `.venv/Scripts/python.exe db/migrate.py` — Expected: `046_stats_weather_explore.sql` applied, no error.
- [ ] **Step 3: Verify tables** — Run: `psql "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map" -c "\dt stats_weather_*"` — Expected: 8 tables (monthly + 7 new).
- [ ] **Step 4: Commit** — `git add db/migrations/046_stats_weather_explore.sql && git commit -m "feat(stats): migration — weather explore snapshot tables"`

### Task 2: Snapshot SQL — climatology + ym + gdd + precip_hist

**Files:** Modify `pipelines/build_stats_snapshot.py`

Mirror the Лес `_FOREST_*_SQL` constants exactly: module-level string, **zero `%` characters**, `INSERT INTO … SELECT …`, wrapped so it only reads `forecast.weather_daily` (the `_FORECAST_GUARDED` map handles the skip-if-absent). All four constants below average the 18 districts per `date` first (`day` CTE) so LO-aggregate is a true areal mean, then aggregate over the period; **full years 2018-2025 only** (`WHERE date >= DATE '2018-01-01' AND date < DATE '2026-01-01'`).

- [ ] **Step 1: Add the four constants** (place after `_WEATHER_SQL`, before `_SEASON_WEEK_SQL`):

```python
_WEATHER_CLIM_SQL = """
    INSERT INTO stats_weather_clim
        (month, t_mean, t_min, t_max, precip, soil_moist, p_minus_et0)
    WITH day AS (
        SELECT date,
               AVG(temperature_2m_mean)    AS t_mean,
               AVG(temperature_2m_min)     AS t_min,
               AVG(temperature_2m_max)     AS t_max,
               AVG(precipitation_sum)      AS precip,
               AVG(soil_moisture_1_to_3cm) AS soil_moist,
               AVG(precipitation_sum) - AVG(et0_fao_evapotranspiration)
                                           AS p_minus_et0
        FROM forecast.weather_daily
        WHERE date >= DATE '2018-01-01' AND date < DATE '2026-01-01'
        GROUP BY date
    )
    SELECT EXTRACT(MONTH FROM date)::int AS month,
           AVG(t_mean), AVG(t_min), AVG(t_max),
           AVG(precip) * 30.4, AVG(soil_moist), AVG(p_minus_et0) * 30.4
    FROM day
    GROUP BY 1
    ORDER BY 1
"""

_WEATHER_YM_SQL = """
    INSERT INTO stats_weather_ym (year, month, t_mean, precip_total)
    WITH day AS (
        SELECT date,
               AVG(temperature_2m_mean) AS t_mean,
               AVG(precipitation_sum)   AS precip
        FROM forecast.weather_daily
        WHERE date >= DATE '2018-01-01' AND date < DATE '2026-01-01'
        GROUP BY date
    )
    SELECT EXTRACT(YEAR FROM date)::int,
           EXTRACT(MONTH FROM date)::int,
           AVG(t_mean), SUM(precip)
    FROM day
    GROUP BY 1, 2
    ORDER BY 1, 2
"""

_WEATHER_GDD_SQL = """
    INSERT INTO stats_weather_gdd (year, month, gdd5_cum)
    WITH day AS (
        SELECT date,
               GREATEST(AVG(temperature_2m_mean) - 5.0, 0.0) AS gdd
        FROM forecast.weather_daily
        WHERE date >= DATE '2018-01-01' AND date < DATE '2026-01-01'
        GROUP BY date
    ),
    monthly AS (
        SELECT EXTRACT(YEAR FROM date)::int  AS y,
               EXTRACT(MONTH FROM date)::int AS m,
               SUM(gdd)                      AS gdd_m
        FROM day GROUP BY 1, 2
    )
    SELECT y, m,
           SUM(gdd_m) OVER (PARTITION BY y ORDER BY m
                            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
    FROM monthly
    ORDER BY y, m
"""

_WEATHER_PRECIP_HIST_SQL = """
    INSERT INTO stats_weather_precip_hist (bin_lo, days)
    WITH day AS (
        SELECT date, AVG(precipitation_sum) AS precip
        FROM forecast.weather_daily
        WHERE date >= DATE '2018-01-01' AND date < DATE '2026-01-01'
          AND EXTRACT(MONTH FROM date) BETWEEN 6 AND 9
        GROUP BY date
    )
    SELECT LEAST(FLOOR(precip / 2.0)::int * 2, 30) AS bin_lo,
           COUNT(*)::int
    FROM day
    GROUP BY 1
    ORDER BY 1
"""
```

Notes baked into the plan: `precip * 30.4` converts mean-daily to a representative monthly total (≈ days/month); the open-ended top bin `LEAST(..., 30)` folds all ≥30 mm/day days into one `bin_lo=30` bucket (frontend labels it `30+`). These are intentional — restate them as code comments above each constant.

- [ ] **Step 2: Register steps** — in `SNAPSHOT_STEPS` add, after the existing `("stats_weather_monthly", _WEATHER_SQL)`:

```python
    ("stats_weather_clim", _WEATHER_CLIM_SQL),
    ("stats_weather_ym", _WEATHER_YM_SQL),
    ("stats_weather_gdd", _WEATHER_GDD_SQL),
    ("stats_weather_precip_hist", _WEATHER_PRECIP_HIST_SQL),
```

- [ ] **Step 3: Guard them** — add the four table names to `_FORECAST_GUARDED` mapping each to `"forecast.weather_daily"` (same as `stats_weather_monthly`).

- [ ] **Step 4: Run snapshot** — Run: `DATABASE_URL=postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map .venv/Scripts/python.exe pipelines/build_stats_snapshot.py` — Expected: completes; no `incomplete placeholder` (psycopg `%`); the four steps report row counts > 0.
- [ ] **Step 5: Sanity SQL** — Run: `psql … -c "SELECT count(*) FROM stats_weather_clim; SELECT count(*) FROM stats_weather_ym; SELECT min(gdd5_cum),max(gdd5_cum) FROM stats_weather_gdd; SELECT * FROM stats_weather_precip_hist ORDER BY bin_lo;"` — Expected: clim=12, ym≈96, gdd max ~1500-2500, hist bins monotone, bin_lo top = 30.
- [ ] **Step 6: Commit** — `git add pipelines/build_stats_snapshot.py && git commit -m "feat(stats): weather climatology/ym/gdd/precip-hist snapshot SQL"`

### Task 3: Snapshot SQL — year + district + district_month

**Files:** Modify `pipelines/build_stats_snapshot.py`

`stats_weather_year` emits 2018-2026; 2026 row has `is_partial=true`. Anomalies are vs the 2018-2025 mean (a CTE `base`). Frost DOY: last spring frost = max day-of-year in Jan–Jun with `t_min < 0`; first autumn frost = min day-of-year in Jul–Dec with `t_min < 0`. `mushroom_days` (per district) = count of Aug–Sep days with `soil_moisture_1_to_3cm > 0.30` AND `soil_temperature_6cm BETWEEN 8 AND 18`, averaged per-year over full years.

- [ ] **Step 1: Add three constants** (after `_WEATHER_PRECIP_HIST_SQL`):

```python
_WEATHER_YEAR_SQL = """
    INSERT INTO stats_weather_year
        (year, is_partial, t_mean, t_anom, precip_total, precip_anom,
         warm_days, warm_soil_moist, rainy_days_warm, snow_days,
         last_spring_frost_doy, first_autumn_frost_doy)
    WITH day AS (
        SELECT date,
               EXTRACT(YEAR FROM date)::int        AS y,
               EXTRACT(DOY  FROM date)::int        AS doy,
               EXTRACT(MONTH FROM date)::int       AS m,
               AVG(temperature_2m_mean)            AS t_mean,
               AVG(temperature_2m_min)             AS t_min,
               AVG(precipitation_sum)              AS precip,
               AVG(soil_moisture_1_to_3cm)         AS sm,
               AVG(snow_depth)                     AS snow
        FROM forecast.weather_daily
        GROUP BY date
    ),
    per_year AS (
        SELECT y,
               (y = 2026)                                  AS is_partial,
               AVG(t_mean)                                 AS t_mean,
               SUM(precip)                                 AS precip_total,
               COUNT(*) FILTER (WHERE t_mean >= 10)         AS warm_days,
               AVG(sm) FILTER (WHERE m BETWEEN 6 AND 9)     AS warm_sm,
               COUNT(*) FILTER (WHERE m BETWEEN 6 AND 9
                                  AND precip >= 1.0)        AS rainy_warm,
               COUNT(*) FILTER (WHERE snow > 0)             AS snow_days,
               MAX(doy) FILTER (WHERE m <= 6 AND t_min < 0) AS last_spring,
               MIN(doy) FILTER (WHERE m >= 7 AND t_min < 0) AS first_autumn
        FROM day GROUP BY y
    ),
    base AS (
        SELECT AVG(t_mean) AS t_base, AVG(precip_total) AS p_base
        FROM per_year WHERE y BETWEEN 2018 AND 2025
    )
    SELECT p.y, p.is_partial, p.t_mean, p.t_mean - b.t_base,
           p.precip_total, p.precip_total - b.p_base,
           p.warm_days, p.warm_sm, p.rainy_warm, p.snow_days,
           p.last_spring, p.first_autumn
    FROM per_year p CROSS JOIN base b
    ORDER BY p.y
"""

_WEATHER_DISTRICT_SQL = """
    INSERT INTO stats_weather_district
        (district_id, warm_precip, warm_soil_moist, mushroom_days)
    WITH per_year AS (
        SELECT district_id,
               EXTRACT(YEAR FROM date)::int AS y,
               SUM(precipitation_sum) FILTER (
                   WHERE EXTRACT(MONTH FROM date) BETWEEN 6 AND 9) AS warm_p,
               AVG(soil_moisture_1_to_3cm) FILTER (
                   WHERE EXTRACT(MONTH FROM date) BETWEEN 6 AND 9) AS warm_sm,
               COUNT(*) FILTER (
                   WHERE EXTRACT(MONTH FROM date) BETWEEN 8 AND 9
                     AND soil_moisture_1_to_3cm > 0.30
                     AND soil_temperature_6cm BETWEEN 8 AND 18) AS mush
        FROM forecast.weather_daily
        WHERE date >= DATE '2018-01-01' AND date < DATE '2026-01-01'
        GROUP BY district_id, y
    )
    SELECT district_id, AVG(warm_p), AVG(warm_sm), AVG(mush)
    FROM per_year
    GROUP BY district_id
    ORDER BY district_id
"""

_WEATHER_DISTRICT_MONTH_SQL = """
    INSERT INTO stats_weather_district_month
        (district_id, month, soil_moist, soil_temp)
    SELECT district_id,
           EXTRACT(MONTH FROM date)::int,
           AVG(soil_moisture_1_to_3cm),
           AVG(soil_temperature_6cm)
    FROM forecast.weather_daily
    WHERE date >= DATE '2018-01-01' AND date < DATE '2026-01-01'
    GROUP BY district_id, EXTRACT(MONTH FROM date)
    ORDER BY district_id, 2
"""
```

- [ ] **Step 2: Register + guard** — append `("stats_weather_year", _WEATHER_YEAR_SQL)`, `("stats_weather_district", _WEATHER_DISTRICT_SQL)`, `("stats_weather_district_month", _WEATHER_DISTRICT_MONTH_SQL)` to `SNAPSHOT_STEPS`; add all three to `_FORECAST_GUARDED → "forecast.weather_daily"`.
- [ ] **Step 3: Run snapshot** — same command as Task 2 Step 4. Expected: 3 new steps OK, no `%` error.
- [ ] **Step 4: Sanity SQL** — Run: `psql … -c "SELECT year,is_partial,round(t_anom::numeric,2),precip_total,warm_days,last_spring_frost_doy,first_autumn_frost_doy FROM stats_weather_year ORDER BY year; SELECT count(*) FROM stats_weather_district; SELECT count(*) FROM stats_weather_district_month;"` — Expected: 9 year rows (2018-2026, 2026 is_partial=t), t_anom sums≈0 over 2018-2025, warm_days ~120-170, frost DOY plausible (last_spring ~90-160, first_autumn ~250-300), district=18, district_month=216.
- [ ] **Step 5: Commit** — `git add pipelines/build_stats_snapshot.py && git commit -m "feat(stats): weather year/district/district-month snapshot SQL"`

### Task 4: Endpoint `/weather/explore`

**Files:** Modify `services/api/src/api/routes/stats.py`

Mirror `GET /forest/explore` exactly: one function, 7 param-less `conn.execute(SELECT …).fetchall()`, `_STATS_CACHE` header, nullable-float coercion via the existing local `f()` helper pattern. Empty tables → empty arrays (snapshot not built / forecast absent), never 500.

- [ ] **Step 1: Add the endpoint** (place right after `stats_weather`):

```python
@router.get("/weather/explore")
def stats_weather_explore(response: Response) -> dict:
    """Погода-explore: климат-цикл, межгодовая изменчивость, сезон/
    тренды, распределение, география. Из snapshot (stats_weather_*).
    Пусто → пустые массивы (forecast.* отсутствует / снапшот не собран)."""
    def f(x: float | None) -> float | None:
        return float(x) if x is not None else None

    with get_conn() as conn:
        clim = conn.execute(
            "SELECT month, t_mean, t_min, t_max, precip, soil_moist, "
            "p_minus_et0 FROM stats_weather_clim ORDER BY month"
        ).fetchall()
        year = conn.execute(
            "SELECT year, is_partial, t_mean, t_anom, precip_total, "
            "precip_anom, warm_days, warm_soil_moist, rainy_days_warm, "
            "snow_days, last_spring_frost_doy, first_autumn_frost_doy "
            "FROM stats_weather_year ORDER BY year"
        ).fetchall()
        ym = conn.execute(
            "SELECT year, month, t_mean, precip_total "
            "FROM stats_weather_ym ORDER BY year, month"
        ).fetchall()
        gdd = conn.execute(
            "SELECT year, month, gdd5_cum "
            "FROM stats_weather_gdd ORDER BY year, month"
        ).fetchall()
        ph = conn.execute(
            "SELECT bin_lo, days FROM stats_weather_precip_hist "
            "ORDER BY bin_lo"
        ).fetchall()
        dist = conn.execute(
            "SELECT d.district_id, a.name_ru, d.warm_precip, "
            "d.warm_soil_moist, d.mushroom_days "
            "FROM stats_weather_district d "
            "JOIN admin_area a ON a.id = d.district_id "
            "ORDER BY d.district_id"
        ).fetchall()
        dm = conn.execute(
            "SELECT district_id, month, soil_moist, soil_temp "
            "FROM stats_weather_district_month "
            "ORDER BY district_id, month"
        ).fetchall()

    response.headers["Cache-Control"] = _STATS_CACHE
    return {
        "clim": [
            {"month": int(m), "t_mean": f(a), "t_min": f(b), "t_max": f(c),
             "precip": f(p), "soil_moist": f(s), "p_minus_et0": f(e)}
            for m, a, b, c, p, s, e in clim or []
        ],
        "year": [
            {"year": int(y), "is_partial": bool(ip), "t_mean": f(tm),
             "t_anom": f(ta), "precip_total": f(pt), "precip_anom": f(pa),
             "warm_days": int(wd) if wd is not None else None,
             "warm_soil_moist": f(wsm),
             "rainy_days_warm": int(rd) if rd is not None else None,
             "snow_days": int(sd) if sd is not None else None,
             "last_spring_frost_doy": int(ls) if ls is not None else None,
             "first_autumn_frost_doy": int(fa) if fa is not None else None}
            for (y, ip, tm, ta, pt, pa, wd, wsm, rd, sd, ls, fa)
            in year or []
        ],
        "ym": [
            {"year": int(y), "month": int(m), "t_mean": f(t),
             "precip_total": f(p)} for y, m, t, p in ym or []
        ],
        "gdd": [
            {"year": int(y), "month": int(m), "gdd5_cum": f(g)}
            for y, m, g in gdd or []
        ],
        "precip_hist": [
            {"bin_lo": int(b), "days": int(d)} for b, d in ph or []
        ],
        "district": [
            {"district_id": int(i), "district_name": n,
             "warm_precip": f(wp), "warm_soil_moist": f(wsm),
             "mushroom_days": f(md)}
            for i, n, wp, wsm, md in dist or []
        ],
        "district_month": [
            {"district_id": int(i), "month": int(m),
             "soil_moist": f(s), "soil_temp": f(t)}
            for i, m, s, t in dm or []
        ],
    }
```

- [ ] **Step 2: Restart dev API & smoke** — the dev API runs on :8000 with `--reload-dir services/api/src`; it auto-reloads. Run: `curl -s 'http://127.0.0.1:8000/api/stats/weather/explore' | python -c "import sys,json;d=json.load(sys.stdin);print({k:len(v) for k,v in d.items()})"` — Expected: `{'clim':12,'year':9,'ym':96,'gdd':96,'precip_hist':~16,'district':18,'district_month':216}`.
- [ ] **Step 3: Commit** — `git add services/api/src/api/routes/stats.py && git commit -m "feat(stats): GET /weather/explore endpoint"`

### Task 5: api-client interfaces + fetcher

**Files:** Modify `packages/api-client/src/index.ts`

Mirror the Forest block (`ForestExploreResponse` + `fetchForestExplore`). Add after it:

- [ ] **Step 1: Add interfaces + fetcher**

```ts
export interface WeatherClimRow {
  month: number;
  t_mean: number | null; t_min: number | null; t_max: number | null;
  precip: number | null; soil_moist: number | null;
  p_minus_et0: number | null;
}
export interface WeatherYearRow {
  year: number; is_partial: boolean;
  t_mean: number | null; t_anom: number | null;
  precip_total: number | null; precip_anom: number | null;
  warm_days: number | null; warm_soil_moist: number | null;
  rainy_days_warm: number | null; snow_days: number | null;
  last_spring_frost_doy: number | null;
  first_autumn_frost_doy: number | null;
}
export interface WeatherYmRow {
  year: number; month: number;
  t_mean: number | null; precip_total: number | null;
}
export interface WeatherGddRow {
  year: number; month: number; gdd5_cum: number | null;
}
export interface WeatherPrecipHistRow { bin_lo: number; days: number; }
export interface WeatherDistrictRow {
  district_id: number; district_name: string;
  warm_precip: number | null; warm_soil_moist: number | null;
  mushroom_days: number | null;
}
export interface WeatherDistrictMonthRow {
  district_id: number; month: number;
  soil_moist: number | null; soil_temp: number | null;
}
export interface WeatherExploreResponse {
  clim: WeatherClimRow[];
  year: WeatherYearRow[];
  ym: WeatherYmRow[];
  gdd: WeatherGddRow[];
  precip_hist: WeatherPrecipHistRow[];
  district: WeatherDistrictRow[];
  district_month: WeatherDistrictMonthRow[];
}
export async function fetchWeatherExplore(): Promise<WeatherExploreResponse> {
  return apiGet<WeatherExploreResponse>("/api/stats/weather/explore");
}
```

(Use whatever the file's existing fetch helper is — copy the exact call form `fetchForestExplore` uses; if it is not `apiGet`, match it.)

- [ ] **Step 2: Typecheck** — Run: `cd apps/web && export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit` — Expected: clean.
- [ ] **Step 3: Commit** — `git add packages/api-client/src/index.ts && git commit -m "feat(stats): weather-explore api-client types + fetcher"`

### Task 6: DivergingBarChart wrapper

**Files:** Create `apps/web/src/components/stats/charts/DivergingBarChart.tsx`

Signed horizontal bars; positive = `colorPos` token, negative = `colorNeg` token; a zero reference line. Recharts isolated here. Use Recharts `Cell` to color per-sign and `ReferenceLine x={0}`.

- [ ] **Step 1: Write the component**

```tsx
/**
 * DivergingBarChart — signed horizontal bars around 0 (anomalies).
 * Recharts isolated here; colors only from passed CSS-var tokens
 * (Claude Design re-skins).
 */
import {
  ResponsiveContainer, BarChart as RBarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid,
} from "recharts";

export interface DivergingBarChartProps {
  data: Array<Record<string, number | string | null>>;
  categoryKey: string;
  valueKey: string;
  colorPos: string;
  colorNeg: string;
  height?: number;
}

export function DivergingBarChart({
  data, categoryKey, valueKey, colorPos, colorNeg, height = 280,
}: DivergingBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RBarChart data={data} layout="vertical"
                 margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid stroke="var(--rule)" strokeDasharray="3 3"
                       horizontal={false} />
        <XAxis type="number" stroke="var(--ink-faint)"
               fontSize="var(--fs-xs)" />
        <YAxis type="category" dataKey={categoryKey}
               stroke="var(--ink-faint)" fontSize="var(--fs-xs)"
               width={60} interval={0} />
        <Tooltip
          contentStyle={{
            background: "var(--paper-rise)",
            border: "1px solid var(--rule)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--fs-xs)",
          }}
        />
        <ReferenceLine x={0} stroke="var(--ink-faint)" />
        <Bar dataKey={valueKey} radius={[0, 2, 2, 0]}>
          {data.map((d, i) => (
            <Cell key={i}
                  fill={Number(d[valueKey]) < 0 ? colorNeg : colorPos} />
          ))}
        </Bar>
      </RBarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Typecheck** — `cd apps/web && export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit` — clean.
- [ ] **Step 3: Commit** — `git add apps/web/src/components/stats/charts/DivergingBarChart.tsx && git commit -m "feat(stats): DivergingBarChart wrapper for anomaly cards"`

### Task 7: transforms.ts + tests

**Files:** Create `apps/web/src/components/stats/weather/transforms.ts`, `transforms.test.ts`

Pure, deterministic, never throw/NaN, never mutate, coalesce nulls→0 where summing. Mirror `forest/transforms.ts` header & discipline. Functions:

- `MONTH_RU: string[]` — `["янв","фев",…,"дек"]` (index 0=Jan).
- `monthLabel(m: number): string` — `MONTH_RU[m-1] ?? String(m)`.
- `climSeries(clim)` → `{month:number,label:string,t_mean,t_min,t_max,precip,soil_moist,p_minus_et0}[]` sorted by month, nulls→0, label via monthLabel.
- `fullYears(year)` → `WeatherYearRow[]` with `is_partial===false` (drops the 2026 partial), sorted by year. Every bar/anomaly card consumes this, never the raw array.
- `ymMatrix(ym, field)` → `{rows:string[]/*years*/, cols:number[]/*1..12*/, values:number[][]}` zero-filled, for Heatmap (cards 7,8). rows = distinct years asc as strings, cols = 1..12.
- `gddSeries(gdd)` → `{ data:{month:number,label:string,[year:string]:number}[], years:string[] }` pivoted long→wide (one column per year, x=month) for MultiLineChart card 13; missing (year,month)→0.
- `precipHistBars(ph)` → `{label:string, days:number}[]`, label = `bin_lo===30 ? "30+" : `${bin_lo}–${bin_lo+2}``.
- `districtRankWeather(district, field)` → `{name:string,value:number}[]` desc, nulls dropped; field ∈ `warm_precip|warm_soil_moist|mushroom_days`.
- `districtMonthMatrix(dm, field, districtName)` → `{rows:string[],cols:number[],values:number[][]}` rows=district names (by id asc), cols=1..12, for Heatmap cards 19,20. `districtName: Record<string,string>`.
- `shortDistrict(name: string): string` — same rules as ForestTab (strip ` район`; `Гатчинский муниципальный округ`→`Гатчинский`; `Сосновоборский городской округ`→`Сосновоборск`). (Reused — if ForestTab's copy is exported, import it; else duplicate the small helper here. Keep one definition if practical.)
- `frostWindowItems(year)` → `{label:string,start:number,end:number,mark:number}[]` from `fullYears`, `start=last_spring_frost_doy`, `end=first_autumn_frost_doy`, `mark=start` (RangeBars needs a mark; use start). Drop rows where either DOY is null.

- [ ] **Step 1: Write `transforms.ts`** implementing exactly the above signatures (pure; mirror forest/transforms.ts style and JSDoc).
- [ ] **Step 2: Write `transforms.test.ts`** — vitest, ≥12 cases covering: monthLabel 1→"янв"/13→"13"; climSeries sort+null→0; fullYears drops is_partial & sorts; ymMatrix zero-fill + shape; gddSeries pivot (year cols, month rows, missing→0); precipHistBars "0–2" and top "30+"; districtRankWeather desc + null-drop; districtMonthMatrix shape; shortDistrict 3 rules; frostWindowItems null-drop + start/end mapping.
- [ ] **Step 3: Run tests** — Run from worktree root: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run apps/web/src/components/stats/weather/transforms.test.ts` — Expected: all green.
- [ ] **Step 4: Commit** — `git add apps/web/src/components/stats/weather/transforms.ts apps/web/src/components/stats/weather/transforms.test.ts && git commit -m "feat(stats): weather transforms + vitest"`

### Task 8: WeatherTab compose + wire + CSS

**Files:** Create `apps/web/src/components/stats/weather/WeatherCharts.module.css`, `apps/web/src/routes/stats/WeatherTab.tsx`; modify `apps/web/src/routes/stats/StatsTabs.tsx`

- [ ] **Step 1: CSS** — copy `apps/web/src/components/stats/forest/ForestCharts.module.css` verbatim to `weather/WeatherCharts.module.css` (same class names: `section,h,grid,card,ct,ci,empty`).
- [ ] **Step 2: Write `WeatherTab.tsx`** — mirror `ForestTab.tsx` structure exactly:
  - `useReducer` DataState loading/error/done; single `fetchWeatherExplore()` in `useEffect`.
  - Module-scope rounding helpers `r1=x=>Math.round(x*10)/10`, `r2`, `r0` (same as ForestTab).
  - `districtName: Record<string,string>` from `resp.district` (String(id)→shortDistrict(name)).
  - Compose the 20 cards per the Card→chart map, each in `<div className={css.card}><h3 className={css.ct}>…</h3><p className={css.ci}>…</p>…chart…</div>`, 5 `<section className={css.section}>` with `<h2 className={css.h}>` titles: `Климатический цикл`, `Межгодовая изменчивость`, `Сезон и тренды`, `Распределение`, `География`.
  - Rounding at compose site: °C→r1, precip mm→r1, soil_moist→r2 (м³/м³, 2 dp), p_minus_et0→r1, GDD→r0, days→r0, DOY→r0, anomalies→r1.
  - Captions must be **descriptive & data-true** (no inverted claims — the Лес DF-1 lesson). Baseline cards say «среднее 2018–2025», soil moisture says «м³/м³», GDD says «база 5 °C», trend cards carry no slope/forecast wording. Card 18 caption: «Структурный прокси (влажность+темп. почвы авг–сен), не наблюдённый сбор».
  - Heatmaps (7,8,19,20): pass `rows,cols,values` from the matrix transforms; cols labelled via monthLabel at the wrapper call by mapping `cols` to labels array if Heatmap takes `cols:(string|number)[]` (it does — pass month labels as strings).
  - DivergingBarChart cards 5,6: `colorPos="var(--idx-1)"` (cool/positive) `colorNeg="var(--idx-4)"` (warm/terracotta) for temp; for precip use `colorPos="var(--idx-1)"` (wet) `colorNeg="var(--chanterelle)"` (dry). Keep tokens only.
  - MultiLineChart card 1: `series=[{key:"t_mean",label:"средняя",color:"var(--forest)"}]`, `band={lowerKey:"t_min",upperKey:"t_max",color:"var(--idx-2)"}`, `xKey:"label"`.
  - MultiLineChart card 13 (GDD): `series` = one per year from `gddSeries().years` with palette tokens cycling a CATEGORICAL token list (not the sequential ramp — reuse the lesson from Лес DF-5: pick contrasting tokens), `xKey:"label"`.
  - RangeBars card 14: items from `frostWindowItems`; `min=0,max=366`, ticks at `[0,90,180,270,366]` labelled by approximate month if trivial, else numeric DOY (numeric is acceptable — caption explains «день года»).
  - Empty-state guard per card: if the relevant transformed array is empty render `<p className={css.empty}>Нет данных.</p>` (forecast.* absent in CI is normal — never crash).
- [ ] **Step 3: Wire** — in `StatsTabs.tsx` add `import { WeatherTab } from "./WeatherTab";` and change the final fallback so `active === "weather" ? <WeatherTab /> :` precedes the «Вкладка в работе.» placeholder (which then only covers truly unknown keys / can remain as the last `:`).
- [ ] **Step 4: Typecheck** — `cd apps/web && export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit` — clean.
- [ ] **Step 5: Commit** — `git add apps/web/src/components/stats/weather apps/web/src/routes/stats/WeatherTab.tsx apps/web/src/routes/stats/StatsTabs.tsx && git commit -m "feat(stats): WeatherTab — 20 cards composed + wired"`

### Task 9: Mandatory visual-QA loop

**Files:** none new — verification + fix iterations only.

The controller (not a single subagent) owns this, exactly as the Лес Task 9 loop.

- [ ] **Step 1: Capture** — adapt `C:/tmp/forest_qa.cjs` to a `C:/tmp/weather_qa.cjs` pointing at `http://localhost:5173/stats?tab=weather`, output `C:/tmp/weather_NN.png` + `weather_qa.json`. Dev web (:5173) + dev API (:8000) must be up.
- [ ] **Step 2: Eyes-on every card** — Read all 20 PNGs. Check for: inverted/false captions (Лес DF-1), axis label thinning/misalignment on multi-category bars (Лес DF-2 — district cards 16-18 need `interval={0}`/height like Лес fixes; BarChart already carries the Task-from-Лес fixes), heatmap color collapse + cell-text contrast (Лес DF-3/DF-8 — Heatmap wrapper already fixed), legend order (Лес DF-4), color collisions (Лес DF-5), clipped labels (Лес DF-6/7), partial-2026 leaking into any bar, soil-moist shown as % instead of м³/м³, any NaN/empty.
- [ ] **Step 3: Compile defect list** (DF-1…DF-N), dispatch fix subagent(s), re-capture, re-verify. Loop until every card is clean by the controller's own eyes.
- [ ] **Step 4: Final commit** — ensure all fixes committed (not pushed — parent controls deploy).

---

## Self-Review (writing-plans)

- **Spec coverage:** all 20 approved ideas map to a card in the Card→chart map; the dual-axis «грибное окно» is deliberately re-expressed (documented). 7 snapshot tables cover every card's data. ✓
- **Placeholder scan:** every SQL/TS/TSX step has literal code; transforms list exact signatures + test cases; no "similar to" hand-waving except explicit "mirror ForestTab" (the established in-repo pattern, with exact file paths given). ✓
- **Type consistency:** endpoint JSON keys ↔ api-client interfaces ↔ transforms inputs use one naming set (`clim/year/ym/gdd/precip_hist/district/district_month`; `t_mean/precip/soil_moist/...`). `fullYears` is the single gate for the partial-2026 rule. `shortDistrict` single definition (import or one copy). ✓

---

## Exit-state (2026-05-18) — ALL TASKS DONE, branch unpushed

Tasks 1–9 complete. Branch `claude/upbeat-archimedes-da0d9c`, **not pushed**
(awaiting user review before deploy, per the autonomous-review mandate).

**Task 9 visual-QA loop — DONE.** All 20 Погода cards reviewed with own
eyes; the only defect was a degraded-source soil-data artifact in
`forecast.weather_daily` (read-only sister schema), fixed defensively in
two layers:

1. `transforms.ts::districtMonthMatrix` — drops a district whose every
   month cell for the chosen field is null (no misleading all-zero
   heatmap row); per-field independent (a soil-moist-artifact district
   keeps its valid soil-temp row). +3 vitest cases (17/17). Commit
   `3e10995`.
2. `build_stats_snapshot.py` — `quality` CTE NULLs degraded districts:
   soil-moisture `sm_n=0 OR sm_sd<0.02`, soil-temp `st_n=0 OR
   st_sd<0.05`, `warm_precip` untouched. Threshold widened `0.005→0.02`
   in commit `0f3fe78` after Волховский (sd 0.00625, flat 0.11–0.14
   series) slipped the first cut — genuine LO districts have sd
   0.042–0.064 (7× gap → 0.02 is a safe cut, 3× margin both sides).

Final honest result: Кингисеппский (100% NULL soil) dropped from all
soil cards; Кировский + Волховский (flat soil-moisture artifact, but
genuine soil-temp) dropped from soil-moisture cards 16/17/18 yet
**retained** in soil-temp card 19 (17 rows = 18 − Кингисеппский). Cards
16/17 = 15 healthy bars, card 18 = 15-row heatmap, card 19 = 17-row
heatmap, all visually verified clean.

**Обзор tab:** left as the placeholder by explicit user decision
(2026-05-18) — composition to be decided later. 6 pre-built digest
components (`KpiStrip`/`SeasonPulse`/`ForestComposition`/
`TrendingSpecies`/`WeatherSnapshot`/`SpeciesLeaderboardMini`) remain
orphaned-but-ready for whichever direction is chosen.

**Deploy when approved:** push branch → merge → rebuild + ship the
`stats_*` snapshot on TimeWeb (and Oracle) prod DBs (`build_stats_snapshot.py`
must run there — endpoints read the snapshot, not live `forecast.*`).
