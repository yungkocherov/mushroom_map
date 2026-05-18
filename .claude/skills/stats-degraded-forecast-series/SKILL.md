---
name: stats-degraded-forecast-series
description: Use when a /stats card fed from forecast.* (weather/soil) renders a misleading flat / all-zero / all-same-value series for some districts — a solid heatmap row, a lone empty bar, a non-physical constant band. The forecast.weather_daily model emits flat fill on no-soil grid cells; this is the diagnose→threshold→2-layer-defensive-fix→eyes-on flow. We never write forecast.*. Saves the ~hour this cost in the Погода tab build (it bit twice — the first stddev cut was too tight).
---

# Stats: detect & defensively NULL degraded forecast.* series

`forecast.weather_daily` is a **read-only sister-repo schema** (mushroom-forecast
owns it; two-sided contract — we never write it). Its soil columns
(`soil_moisture_1_to_3cm`, `soil_temperature_6cm`) are degraded on grid
cells that land on no-soil terrain (coastal Baltic, water): the upstream
model emits a **flat / near-constant fill** instead of NULL. Rendered raw
this becomes a lie — a solid-color all-zero heatmap row, a lone empty
ranking bar, a non-physical constant band — that looks like a frontend bug
but is bad source data.

This bit the Погода tab (2026-05-18). The first stddev cut (`0.005`) was
too tight: Волховский (sd 0.00625, flat 0.11–0.14) slipped past and
rendered as a misleading lone empty "грибные дни" bar. The diagnose flow
ran twice. Phase-3 district/species profiles consume the same columns —
expect this again.

## Symptom → suspicion

A district/cell shows: an all-zero or all-one-color heatmap row; a lone
empty/near-zero bar while peers are 20–40; a flat band with no seasonal
swing; `0 грибные дни` for one district only. Tests pass (vitest/tsc/pytest
never catch this — it's data, not code). Caught **only by eyes-on the
rendered card.**

## Step 1: Query the source distribution (all districts, snapshot window)

Write to `C:/tmp/*.py` (Cyrillic in stdout → cp1251 crash; use
`sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')`). Use
the **same date window the snapshot `quality` CTE uses** (currently
`date >= '2018-01-01' AND date < '2026-01-01'`).

```python
import io,sys; sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
import psycopg
dsn="postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map"
q="""
SELECT a.id, a.name_ru,
  COUNT(w.soil_moisture_1_to_3cm) smn,
  ROUND(STDDEV_POP(w.soil_moisture_1_to_3cm)::numeric,5) sm_sd,
  ROUND(MAX(w.soil_moisture_1_to_3cm)::numeric,3) sm_max,
  COUNT(w.soil_temperature_6cm) stn,
  ROUND(STDDEV_POP(w.soil_temperature_6cm)::numeric,4) st_sd
FROM admin_area a
JOIN forecast.weather_daily w ON w.district_id=a.id
WHERE w.date >= DATE '2018-01-01' AND w.date < DATE '2026-01-01'
GROUP BY a.id,a.name_ru ORDER BY sm_sd NULLS FIRST
"""
with psycopg.connect(dsn) as c:
    for r in c.execute(q): print(r)
```

`admin_area` district name column is **`name_ru`** (not `name`). The 18 LO
weather districts are enumerated via `JOIN forecast.weather_daily` (no
`admin_level` column on admin_area).

## Step 2: Confirm the artifact / genuine gap

A real LO soil-moisture series swings strongly with season. Observed
(2026-05-18): genuine districts `sm_sd 0.042–0.064, max ~0.43`; artifacts
`sd 0.000 max 0.05` (Кировский, constant fill) and `sd 0.00625 max 0.14`
(Волховский, noisy flat); fully-absent `n=0` (Кингисеппский, coastal).
**~7× gap** between worst artifact (0.006) and lowest genuine (0.042).
Soil-temp artifacts appear **only at n=0** (genuine sd 6.8–9.1, no
low-variance trap) — so a flat-soil-moist district can still have a
perfectly valid soil-temp row.

Pick the stddev threshold **inside the gap with margin both sides** — not
hugging the worst artifact. Current safe cut: soil-moist `sd < 0.02`
(3× above the 0.006 artifact, 2× below the 0.042 genuine); soil-temp
`sd < 0.05` (only ever trips n=0). Re-derive from the live distribution if
the forecast model is retrained — don't trust the old number blindly (the
first `0.005` was a too-tight guess).

## Step 3: 2-layer defensive fix (we never touch forecast.*)

**Layer A — snapshot SQL** `pipelines/build_stats_snapshot.py`. A
`quality` CTE per district computes `COUNT()` + `STDDEV_POP()` of each
soil column; the final SELECT wraps each soil output in
`CASE WHEN q.<x>_n = 0 OR q.<x>_sd < <thr> THEN NULL ELSE <agg> END`.
Guard **per-field independently** (a soil-moist-artifact district keeps
its valid soil-temp). Leave non-soil columns (`warm_precip`) untouched.
psycopg3 runs this SQL with **no params** → it must be 100% `%`-free
incl. comments/strings. The snapshot is the source-of-truth NULL layer.

**Layer B — pure transform** `apps/web/src/components/stats/weather/transforms.ts`.
Matrix transforms must **exclude a row whose every cell for the chosen
field is null** (don't `?? 0` it — that re-creates the misleading solid
row). Build a `hasReal` set, filter ids before sort. Per-field
independent. Add vitest cases (all-null excluded; partial-null kept &
zero-filled; per-field independence). Contract stays: never throw, never
NaN, never mutate input.

The API endpoint needs no change if its row mapper already passes `None`
through (no `COALESCE` on soil fields) — verify, don't assume.

## Step 4: Rebuild snapshot + verify data, then EYES-ON

```bash
C:/Users/ikoch/mushroom-map/.venv/Scripts/python.exe pipelines/build_stats_snapshot.py
```

Verify counts in the rebuilt `stats_weather_district` /
`stats_weather_district_month` (non-null district counts per field match
the genuine count; artifacts NULL). Then re-capture the cards
(`C:/tmp/<tab>_qa.cjs` playwright → `C:/tmp/<tab>_NN.png`) and **Read every
affected PNG**. Glyph math is a fast check (heatmap glyphs =
rows×12). Confirm: artifact districts gone from the artifact-field cards;
genuine-other-field rows retained (e.g. soil-temp row kept for a
soil-moist-artifact district); no remaining flat/zero/solid misleading
row. This eyes-on step is how the artifact was found in the first place —
do not skip it.

## When NOT to use

- A genuinely low (but real, swinging) value — keep it; the threshold has
  margin specifically so real low districts survive. Don't NULL data just
  because it's small.
- The whole column is NULL in CI (forecast.* schema absent) — that's the
  normal `to_regclass`-guarded path; transforms already render
  «Нет данных», not a crash. Not this skill.
- A non-soil weather column looks off — soil-grid degradation is
  soil-specific; investigate that column's own source separately.
- You'd be tempted to "fix" forecast.weather_daily — **never.** Two-sided
  read-only contract. All defenses live in our snapshot CTE + transforms.
