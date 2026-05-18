# Сезонность tab — review-fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 17 defects + layout/IA issues the user found reviewing the live Сезонность tab, plus introduce a project-wide canonical species→colour binding.

**Architecture:** Pure transforms in `season/transforms.ts` (vitest TDD, never throw/NaN/mutate). Recharts isolated in `charts/*.tsx` wrappers (CSS-var colours only — Claude Design re-skins later). Heavy aggregates precomputed offline by `pipelines/build_stats_snapshot.py` into `public.stats_season_*`; thin O(rows) endpoint; React reads typed api-client. New species-colour tokens live in `packages/tokens/src/tokens.css`; the species→token map is a new pure module.

**Tech Stack:** PostgreSQL/psycopg3, FastAPI, React 18 + Recharts, TypeScript, Vitest, Vite.

**Environment (every command assumes):**
- Worktree root cwd: `C:/Users/ikoch/mushroom-map/.claude/worktrees/upbeat-archimedes-da0d9c`
- Python: `/c/Users/ikoch/mushroom-map/.venv/Scripts/python.exe` (worktree has no `.venv`)
- DSN dev: `postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map` (port 5434)
- Node on PATH first: `export PATH="/c/Program Files/nodejs:$PATH"`
- Vitest: `cd apps/web && npx vitest run src/components/stats/season/transforms.test.ts`
- tsc: `cd apps/web && npx tsc --noEmit`
- **psycopg3 `%` trap:** snapshot SQL runs via `cur.execute(sql)` with NO params — must be 100% `%`-free incl. comments. Endpoint SQL uses real `%s`.
- **Docker:** the user starts Docker Desktop, never the agent. If db unreachable, ask the user.
- **No prod deploy / no push.** Commits land on branch `claude/upbeat-archimedes-da0d9c` only.
- After all tasks: rerun `build_stats_snapshot.py` on dev, restart API, **per-card** visual-QA every Сезонность card at full resolution (NOT one downscaled fullPage — that is exactly how these 17 defects were missed).

**User punch-list → task map:**
- Item 1 (week→date X axis; tooltip round 2dp) → Task 4, Task 6
- Item 2 (VK group link in tab intro) → Task 6
- Item 3 (per-card species/year state, not shared) → Task 7
- Item 4 (card 2 line gaps) → Task 1 (connectNulls) + Task 7
- Item 5 (card 3 heatmap text collisions) → Task 2
- Item 6 (canonical species→colour project-wide) → Task 5
- Item 7 (composition tooltip % not fractions) → Task 1 (AreaChart)
- Item 8 (sort season-length bars) → Task 3
- Item 9 (clarify phenological-trend card) → Task 6
- Item 10 (all tables/heatmaps text overlap) → Task 2
- Item 11 (porcini-in-March artefact) → Task 3 (monthSpeciesShare floor)
- Item 12 (ridge overlap + explain) → Task 2 (RidgeLines) + Task 5 (colour) + Task 6 (caption)
- Item 13 (early/late: explain + drop weeks <20) → Task 3 (yearRanking) + Task 6
- Item 14 (season-volume normalised by corpus growth) → Task 3 (yearRanking posts) + Task 6
- Item 15 (card 15 raggedness) → Task 1 (connectNulls) + Task 7
- Item 16 (anomaly colour-by-sign) → Task 7 (DivergingBarChart swap)
- Item 17 (card 15 norm must be year-independent) → Task 3 (currentVsNorm)
- Layout (2-per-row + left TOC) → Task 8

---

## Task 1: Chart-wrapper props — connectNulls, %-tooltip, week→month X

**Files:**
- Modify: `apps/web/src/components/stats/charts/MultiLineChart.tsx`
- Modify: `apps/web/src/components/stats/charts/AreaChart.tsx`
- Modify: `apps/web/src/components/stats/charts/LineChart.tsx`

No vitest (presentational). Verify by `tsc` + later visual-QA.

- [ ] **Step 1: MultiLineChart — add `connectNulls` + week-axis month labels + 2dp tooltip**

In `MultiLineChart.tsx` add to `MultiLineChartProps`:
```ts
  /** Connect across null gaps (seasonal curves have missing weeks). Default false. */
  connectNulls?: boolean;
  /** Format the tooltip/axis X value (e.g. ISO-week → "май"). */
  xTickFormatter?: (v: number | string) => string;
  /** Round numeric tooltip values to this many decimals. Default: no rounding. */
  tooltipDecimals?: number;
```
Destructure them in the component signature (`connectNulls = false, xTickFormatter, tooltipDecimals`). On `<XAxis>` add `tickFormatter={xTickFormatter}`. On `<Tooltip>` add:
```tsx
          formatter={(val: number | string) =>
            typeof val === "number" && tooltipDecimals != null
              ? Number(val.toFixed(tooltipDecimals))
              : val
          }
          labelFormatter={(l) => (xTickFormatter ? xTickFormatter(l) : l)}
```
On every `<Line>` change `connectNulls={false}` → `connectNulls={connectNulls}`.

- [ ] **Step 2: AreaChart — %-tooltip + X labelFormatter**

In `AreaChart.tsx` add to `AreaChartProps`:
```ts
  /** Format tooltip values as percent (0.1 → "10%"). */
  tooltipPercent?: boolean;
  /** Format the tooltip header / X value (week → month). */
  xTickFormatter?: (v: number | string) => string;
```
Destructure (`tooltipPercent, xTickFormatter`). On `<Tooltip>` add:
```tsx
          formatter={(val: number | string) =>
            tooltipPercent && typeof val === "number"
              ? `${Math.round(val * 100)}%`
              : val
          }
          labelFormatter={(l) => (xTickFormatter ? xTickFormatter(l) : l)}
```
On `<XAxis>` add `tickFormatter={xTickFormatter}`.

- [ ] **Step 3: LineChart — add `connectNulls` + `xTickFormatter`**

In `LineChart.tsx` add `connectNulls?: boolean;` and `xTickFormatter?: (v: number|string)=>string;` to props, destructure (`connectNulls = true` — cumulative S-curve should be continuous), pass `tickFormatter={xTickFormatter}` to `<XAxis>`, and `connectNulls={connectNulls}` to `<Line>`.

- [ ] **Step 4: tsc + commit**

Run: `cd apps/web && export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit && cd ../..`
Expected: clean.
```bash
git add apps/web/src/components/stats/charts/MultiLineChart.tsx apps/web/src/components/stats/charts/AreaChart.tsx apps/web/src/components/stats/charts/LineChart.tsx
git commit -m "feat(stats/charts): connectNulls + percent/x tooltip formatters"
```

---

## Task 2: Heatmap + RidgeLines legibility

**Files:**
- Modify: `apps/web/src/components/stats/charts/Heatmap.tsx`
- Modify: `apps/web/src/components/stats/charts/RidgeLines.tsx`

- [ ] **Step 1: Heatmap — round cell text + suppress when too dense (items 5, 10)**

In `Heatmap.tsx`: add prop `valueDecimals?: number;` to `HeatmapProps`. Replace the cell-text render so it (a) formats the number and (b) is hidden when the cell is too narrow for text. After `gw`/`gh` are computed add:
```ts
  const fmt = (v: number) =>
    valueDecimals != null
      ? v.toFixed(valueDecimals)
      : Number.isInteger(v) ? String(v) : v.toFixed(1);
  // ~6px per mono digit at fontSize 10; hide text if it cannot fit.
  const showCellText = gw >= 26 && gh >= 16;
```
Change the cell-text block guard from `{v != null && (() => {` to `{v != null && showCellText && (() => {` and render `{fmt(v)}` instead of `{v}`. Update the `<title>` tooltip to `${r} / ${cols[ci]}: ${v == null ? "—" : fmt(v)}` so the rounded value is still inspectable when text is hidden.

- [ ] **Step 2: RidgeLines — separate the ridges + per-series colour (item 12)**

In `RidgeLines.tsx`: add optional `colors?: string[]` to `RidgeLinesProps` (one CSS-var per series, index-aligned; falls back to `var(--forest)`). Change geometry so a ridge cannot climb into the row above: `rowH = 46` stays, change `const overlap = 22;` → `const overlap = 14;` and clamp the curve height to `rowH + overlap` (already is). Replace the hard-coded `fill="var(--forest)"` / `stroke="var(--forest)"` with `const col = colors?.[si] ?? "var(--forest)";` then `fill={col}` (opacity 0.32) and `stroke={col}`. Keep label text `var(--ink-dim)`.

- [ ] **Step 3: tsc + commit**

Run: `cd apps/web && npx tsc --noEmit && cd ../..` → clean.
```bash
git add apps/web/src/components/stats/charts/Heatmap.tsx apps/web/src/components/stats/charts/RidgeLines.tsx
git commit -m "feat(stats/charts): heatmap value-format + density text guard, ridge separation+colours"
```

---

## Task 3: Transforms — March floor, season-length sort, year-window, posts-normalised volume, fixed norm

**Files:**
- Modify: `apps/web/src/components/stats/season/transforms.ts`
- Test: `apps/web/src/components/stats/season/transforms.test.ts`

All five are pure-function changes — TDD.

- [ ] **Step 1: Write failing tests** (append to `transforms.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import {
  monthSpeciesShare, yearRanking, currentVsNorm,
} from "./transforms";

const W = (species_key: string, year: number, week: number, finds: number, posts = 1) =>
  ({ species_key, year, week, posts, finds });

describe("monthSpeciesShare — volume floor (item 11)", () => {
  it("zeroes a month whose group has tiny absolute support even if its share is high", () => {
    // March (week 11) has only porcini=5 finds total; Aug (week 33) huge.
    const c: any = {
      species: "all",
      weeks: [
        W("porcini", 2020, 11, 5),
        W("porcini", 2020, 33, 5000),
        W("chanterelle", 2020, 33, 5000),
      ],
      norm: [],
    };
    const r = monthSpeciesShare(c);
    const marchIdx = 2; // мар
    // March total (5) is far below the absolute floor → all-zero row.
    expect(r.values[marchIdx].every((v) => v === 0)).toBe(true);
  });
});

describe("yearRanking — season window (item 13) + posts-normalised volume (item 14)", () => {
  const c: any = {
    species: "all",
    weeks: [
      // 2020 complete season (>=40), winter noise on weeks 2..5
      W("porcini", 2020, 3, 100, 50),   // off-season noise (week<20) — must be excluded from mean
      W("porcini", 2020, 30, 200, 10),
      W("porcini", 2020, 42, 100, 5),
      W("porcini", 2020, 50, 10, 1),
    ],
    norm: [],
  };
  it("weightedMeanWeek ignores weeks < 20 (winter noise)", () => {
    const r = yearRanking(c);
    expect(r).toHaveLength(1);
    // mean over weeks {30,42,50} only (week 3 excluded), so > 30.
    expect(r[0].weightedMeanWeek).toBeGreaterThan(30);
  });
  it("exposes findsPerPost (corpus-growth-normalised volume)", () => {
    const r = yearRanking(c);
    // total finds / total posts over in-window weeks, finite, > 0.
    expect(r[0].findsPerPost).toBeGreaterThan(0);
    expect(Number.isFinite(r[0].findsPerPost)).toBe(true);
  });
});

describe("currentVsNorm — norm is year-independent (item 17)", () => {
  const mk = (year: number): any => ({
    species: "porcini",
    weeks: [
      W("porcini", 2020, 30, 100), W("porcini", 2020, 31, 120),
      W("porcini", 2021, 30, 50),  W("porcini", 2021, 31, 60),
    ],
    norm: [
      { species_key: "porcini", week: 30, finds_mean: 75, finds_p25: 50, finds_p75: 100 },
      { species_key: "porcini", week: 31, finds_mean: 90, finds_p25: 60, finds_p75: 120 },
    ],
  });
  it("mean/p25/p75 do not depend on the selected year", () => {
    const a = currentVsNorm(mk(2020), "porcini", 2020);
    const b = currentVsNorm(mk(2020), "porcini", 2021);
    const wk30a = a.find((p) => p.week === 30)!;
    const wk30b = b.find((p) => p.week === 30)!;
    expect(wk30a.mean).toBe(wk30b.mean);
    expect(wk30a.p25).toBe(wk30b.p25);
    expect(wk30a.p75).toBe(wk30b.p75);
    expect(wk30a.mean).toBe(75);
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `cd apps/web && npx vitest run src/components/stats/season/transforms.test.ts`
Expected: FAIL — `findsPerPost` undefined; March not zeroed; (currentVsNorm test may already pass — it pins behaviour, keep it).

- [ ] **Step 3: `monthSpeciesShare` — absolute volume floor (item 11)**

In `monthSpeciesShare`, the per-month near-empty guard currently only drops a month when its *total* < 2% of max. The porcini-March artefact (631 finds = 30% of a ~2 000-find March vs 448 617 annual) passes that. Add an **absolute** floor: a month is noise unless it has real volume. Replace the `emptyThreshold`/`values` block (currently lines ~684-689) with:
```ts
  const emptyThreshold = maxMonthTotal * 0.02;
  // Absolute floor: a month with < 1% of the *annual* find total is
  // off-season noise (dried-stock / "last year" / abroad posts). A tiny
  // count becomes a misleadingly hot SHARE in a low-volume month
  // (porcini "30% of March" from 0.14% of porcini). Zero such months.
  const annualTotal = monthTotals.reduce((s, v) => s + v, 0);
  const absFloor = annualTotal * 0.01;
  const values: number[][] = monthGroupTotals.map((row, mi) => {
    const total = monthTotals[mi];
    if (total === 0 || total < emptyThreshold || total < absFloor) {
      return row.map(() => 0);
    }
    return row.map((v) => v / total);
  });
```

- [ ] **Step 4: `yearRanking` — drop weeks <20 + add `findsPerPost` (items 13, 14)**

`yearRanking` return type becomes `{ year; weightedMeanWeek; total; findsPerPost }[]`. The weighted-mean and totals must use only weeks ≥ 20 (real LO foraging season; winter posts are stored-mushroom / nostalgia noise that drags the "early/late" metric). `findsPerPost` = in-window total finds / in-window total posts for that year — this divides out VK-corpus growth (a bigger group posts more regardless of harvest), giving comparable "basket richness per post". Need posts: `accumulateRaw` only sums finds, so add a parallel posts accumulation. Replace the body of `yearRanking` (currently lines ~486-528) with:
```ts
export function yearRanking(
  c: SeasonCurvesResponse,
): { year: number; weightedMeanWeek: number; total: number; findsPerPost: number }[] {
  const SEASON_START_WEEK = 20;
  // finds + posts per (year, week), all species
  const findsByYW = new Map<string, number>();
  const postsByYW = new Map<string, number>();
  const yearSet = new Set<number>();
  const maxWeekByYear = new Map<number, number>();
  for (const p of c.weeks) {
    yearSet.add(p.year);
    const k = `${p.year}:${p.week}`;
    findsByYW.set(k, (findsByYW.get(k) ?? 0) + p.finds);
    postsByYW.set(k, (postsByYW.get(k) ?? 0) + p.posts);
    const prev = maxWeekByYear.get(p.year) ?? 0;
    if (p.week > prev) maxWeekByYear.set(p.year, p.week);
  }
  const years = [...yearSet].sort((a, b) => a - b);
  if (years.length === 0) return [];
  const completeYears = years.filter((y) => (maxWeekByYear.get(y) ?? 0) >= 40);

  return completeYears.map((year) => {
    const weeksForYear: number[] = [];
    for (const key of findsByYW.keys()) {
      const [ky, kw] = key.split(":");
      if (Number(ky) === year && Number(kw) >= SEASON_START_WEEK) {
        weeksForYear.push(Number(kw));
      }
    }
    weeksForYear.sort((a, b) => a - b);
    const raw = weeksForYear.map((w) => findsByYW.get(`${year}:${w}`) ?? 0);
    const smoothed = smooth7(raw);
    let weightedSum = 0;
    let totalFinds = 0;
    let totalPosts = 0;
    for (let i = 0; i < weeksForYear.length; i++) {
      weightedSum += weeksForYear[i] * smoothed[i];
      totalFinds += smoothed[i];
      totalPosts += postsByYW.get(`${year}:${weeksForYear[i]}`) ?? 0;
    }
    return {
      year,
      weightedMeanWeek: totalFinds > 0 ? weightedSum / totalFinds : 0,
      total: totalFinds,
      findsPerPost: totalPosts > 0 ? totalFinds / totalPosts : 0,
    };
  });
}
```
(`smooth7` is already imported/defined in this file; `accumulateRaw` is no longer used by `yearRanking` but stays — other transforms use it. Do not delete it.)

- [ ] **Step 5: `currentVsNorm` — norm already year-independent; harden (item 17)**

`currentVsNorm` reads norm from `c.norm` (all-years baseline) keyed by week, NOT by `year` — so the band is already year-independent at the data layer. The user-visible "norm moves with year" is the **MultiLineChart auto-Y-rescale**: when the selected year's `value` line is huge/small the shared Y axis rescales, so the fixed band *looks* like it shifts. The data fix here is only to **guarantee** independence with the test from Step 1 (keep `currentVsNorm` as-is if the test passes). The visual fix (fixed Y domain) is Task 7 Step 4. If the Step-1 `currentVsNorm` test passes unchanged, add a one-line code comment above the `normByWeek` build: `// Norm is the all-years baseline (c.norm), keyed by week only — never by the selected year. Do not filter c.norm by year.` and move on.

- [ ] **Step 6: Run tests — verify pass**

Run: `cd apps/web && npx vitest run src/components/stats/season/transforms.test.ts`
Expected: PASS (all new + all pre-existing season transform tests).

- [ ] **Step 7: Commit**
```bash
git add apps/web/src/components/stats/season/transforms.ts apps/web/src/components/stats/season/transforms.test.ts
git commit -m "fix(stats/season): March volume floor, season-window+posts-normalised ranking, pin year-independent norm"
```

---

## Task 4: Week→date X-axis helper (item 1)

**Files:**
- Modify: `apps/web/src/components/stats/season/transforms.ts`
- Test: `apps/web/src/components/stats/season/transforms.test.ts`

- [ ] **Step 1: Failing test** (append to `transforms.test.ts`)
```ts
import { weekMonthLabel } from "./transforms";
describe("weekMonthLabel (item 1 — date X axis)", () => {
  it("maps ISO week to RU month, empty between month-starts", () => {
    expect(weekMonthLabel(1)).toBe("янв");
    expect(weekMonthLabel(2)).toBe("");        // mid-month → blank (sparse ticks)
    expect(weekMonthLabel(31)).toBe("авг");    // ~1 Aug
    expect(weekMonthLabel(53)).toBe("");
  });
});
```

- [ ] **Step 2: Run — fail** (`weekMonthLabel` undefined). Command as Task 3 Step 2.

- [ ] **Step 3: Implement** — append to `transforms.ts` (after `weekToMonthIdx`):
```ts
// ─── weekMonthLabel ───────────────────────────────────────────────────────
/**
 * Sparse RU month label for an ISO week, for chart X axes that users read
 * as a calendar (not week numbers — item 1). Returns the month abbr only on
 * the week each month *starts* (approx week = round(1 + monthIdx*4.345)),
 * "" otherwise so Recharts shows ~12 evenly-spaced month ticks.
 */
export function weekMonthLabel(week: number): string {
  for (let m = 0; m < 12; m++) {
    if (week === Math.round(1 + m * 4.345)) return MONTHS_RU[m];
  }
  return "";
}
```

- [ ] **Step 4: Run — pass.** Then commit:
```bash
git add apps/web/src/components/stats/season/transforms.ts apps/web/src/components/stats/season/transforms.test.ts
git commit -m "feat(stats/season): weekMonthLabel for calendar X axes"
```

---

## Task 5: Canonical species→colour binding (item 6)

**Files:**
- Modify: `packages/tokens/src/tokens.css`
- Create: `apps/web/src/components/stats/season/speciesColors.ts`
- Test: `apps/web/src/components/stats/season/speciesColors.test.ts`

- [ ] **Step 1: Add species colour tokens to `tokens.css`**

In `packages/tokens/src/tokens.css`, inside the `:root` block, immediately after the `--idx-4:` line (the forecast scale, ~line 49) add:
```css

  /* ─── Species identity colours (hard-bound per mushroom group) ────── */
  /* Naturalistic, distinct, used wherever a species/group is encoded by
     colour across the project. Light theme values. */
  --sp-porcini:     #c3a063;  /* белые — beige/tan */
  --sp-aspen:       #c0532a;  /* подосиновики — orange-red */
  --sp-pine-bolete: #6e3b2e;  /* колосовики/боровик — chocolate-burgundy */
  --sp-chanterelle: #d8a534;  /* лисички — gold-yellow */
  --sp-fly-agaric:  #b23b3b;  /* мухоморы — red */
  --sp-spring:      #8a6a3f;  /* сморчки и строчки — earth-ochre */
  --sp-honey:       #b07a3c;  /* опята — warm amber */
  --sp-other:       #8a8270;  /* прочие — neutral (= ink-faint) */
```
Then find the dark-theme override blocks (the file repeats `--idx-0:`… twice more — once under `[data-theme="dark"]` ~line 125 and once under `@media (prefers-color-scheme: dark)` ~line 165). In **each** of those two blocks, after their `--idx-4:` line add the same token names with lightened values for AA on dark:
```css
  --sp-porcini:     #d8bd86;
  --sp-aspen:       #e0764a;
  --sp-pine-bolete: #a86a54;
  --sp-chanterelle: #e6bd5a;
  --sp-fly-agaric:  #d46060;
  --sp-spring:      #b0916a;
  --sp-honey:       #d09a5c;
  --sp-other:       #a8a08c;
```

- [ ] **Step 2: Failing test** — create `speciesColors.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { SPECIES_COLOR, speciesColor } from "./speciesColors";
import { SEASON_GROUP_KEYS } from "./transforms";

describe("speciesColors", () => {
  it("every season group + 'other' has a CSS-var token", () => {
    for (const k of [...SEASON_GROUP_KEYS, "other"]) {
      expect(SPECIES_COLOR[k]).toMatch(/^var\(--sp-[a-z-]+\)$/);
    }
  });
  it("speciesColor falls back to --sp-other for unknown keys", () => {
    expect(speciesColor("totally_unknown")).toBe("var(--sp-other)");
  });
  it("known mapping is stable (chanterelle = gold token)", () => {
    expect(SPECIES_COLOR.chanterelle).toBe("var(--sp-chanterelle)");
  });
});
```

- [ ] **Step 3: Run — fail** (module missing). `cd apps/web && npx vitest run src/components/stats/season/speciesColors.test.ts`

- [ ] **Step 4: Implement** — create `apps/web/src/components/stats/season/speciesColors.ts`:
```ts
/**
 * Canonical mushroom-group → colour binding. ONE source of truth so the
 * same species reads the same colour everywhere (project-wide rule, user
 * 2026-05-18). Values are CSS-var tokens (--sp-*, defined in
 * @mushroom-map/tokens) so the Claude Design pass re-tunes hues without
 * touching chart logic. Keys are the season group_key vocabulary
 * (SEASON_GROUP_KEYS + "other"); see CLAUDE.md GROUP_TO_SLUGS.
 */
export const SPECIES_COLOR: Record<string, string> = {
  porcini: "var(--sp-porcini)",
  aspen_bolete: "var(--sp-aspen)",
  pine_bolete: "var(--sp-pine-bolete)",
  chanterelle: "var(--sp-chanterelle)",
  fly_agaric: "var(--sp-fly-agaric)",
  spring_mushroom: "var(--sp-spring)",
  honey_fungus: "var(--sp-honey)",
  other: "var(--sp-other)",
};

/** Colour for a group key; unknown keys fall back to the neutral token. */
export function speciesColor(key: string): string {
  return SPECIES_COLOR[key] ?? "var(--sp-other)";
}
```

- [ ] **Step 5: Run — pass.** Commit:
```bash
git add packages/tokens/src/tokens.css apps/web/src/components/stats/season/speciesColors.ts apps/web/src/components/stats/season/speciesColors.test.ts
git commit -m "feat(stats): canonical species->colour tokens + speciesColor map"
```

---

## Task 6: SeasonalityTab — copy, VK link, calendar X, colours wired, sort

**Files:**
- Modify: `apps/web/src/routes/stats/SeasonalityTab.tsx`

This task wires Tasks 1–5 into the page and fixes copy items (2, 9, 12-caption, 13-caption, 14-caption), sort (8), calendar X (1), composition/ridge colours (6).

- [ ] **Step 1: Imports** — add to the transforms import block: `weekMonthLabel`. Add new import: `import { SPECIES_COLOR, speciesColor } from "../../components/stats/season/speciesColors";`

- [ ] **Step 2: Intro paragraph + VK link (item 2)** — replace the intro `<p>` (lines ~393-403) text with:
```tsx
        Анализ сезонной динамики: когда, как долго и в каком порядке
        появляются виды. Данные — корпус фото-классифицированных постов
        сообщества{" "}
        <a href="https://vk.com/grib_spb" target="_blank" rel="noopener noreferrer"
           style={{ color: "var(--chanterelle)" }}>
          «Грибы Санкт-Петербурга и Ленинградской области»
        </a>.
```

- [ ] **Step 3: Composition colours + %-tooltip + calendar X (items 6, 7, 1)** — replace `COMPOSITION_COLORS` usage: change `compositionSeries` (lines ~304-308) to colour by group key:
```tsx
  const compositionSeries = groupKeys.map((k) => ({
    key: k,
    label: GROUP_LABELS_RU[k] ?? k,
    color: speciesColor(k),
  }));
```
Delete the now-unused `COMPOSITION_COLORS` const (lines ~62-71). On the card-6 `<AreaChart>` add props `tooltipPercent xTickFormatter={weekMonthLabel}`.

- [ ] **Step 4: Calendar X + 2dp tooltip + connectNulls on line charts (items 1, 4, 15)** — on card-1 and card-2 `<MultiLineChart>` add `connectNulls xTickFormatter={weekMonthLabel} tooltipDecimals={2}`. On card-5 `<LineChart>` (cumulative) add `xTickFormatter={weekMonthLabel}` (keep numeric domain/ticks; the formatter maps tick→month). On card-15 `<MultiLineChart>` add `connectNulls xTickFormatter={weekMonthLabel} tooltipDecimals={2}`.

- [ ] **Step 5: Ridge colours + caption (items 6, 12)** — card 12: build colour array aligned to `ridge.series` by matching label back to group key. Replace the card-12 block body with:
```tsx
                <p className={css.ci}>
                  Календарь природы (ridgeline): каждая полоса — сезонная
                  плотность одного вида, нормированная к своему пику. Читать
                  сверху вниз: кто кого сменяет за сезон. Высота — не
                  абсолютная численность, а форма сезона.
                </p>
                {ridge.series.length === 0 ? (
                  <p className={css.empty}>Недостаточно данных.</p>
                ) : (
                  <RidgeLines
                    series={ridge.series}
                    xLabels={ridge.xLabels}
                    colors={ridge.series.map((s) => {
                      const gk = Object.keys(GROUP_LABELS_RU).find(
                        (k) => GROUP_LABELS_RU[k] === s.label,
                      );
                      return gk ? speciesColor(gk) : "var(--forest)";
                    })}
                    height={ridge.series.length * 52 + 36}
                  />
                )}
```
(ridge.series for qualifying species are labelled via `sp.label` which is the API label, not GROUP_LABELS_RU — if the `find` returns undefined the fallback `var(--forest)` is used; acceptable, colours still distinct per Task 2 separation. Height bumped 46→52 to match the reduced overlap.)

- [ ] **Step 6: Heatmap value formatting (items 5, 10)** — card 3 (week×year, `matrix.values` are smoothed finds, large): add `valueDecimals={0}` to its `<Heatmap>`. Card 10 (overlap, 0..1): add `valueDecimals={2}`. Card 11 (month-share, 0..1): add `valueDecimals={2}`.

- [ ] **Step 7: Sort season length (item 8)** — change `seasonLenData` (lines ~321-323) to sort descending by length:
```tsx
  const seasonLenData = qualifyingItems
    .filter((i) => i.season_len_median !== null)
    .map((i) => ({ label: i.label, len: i.season_len_median! }))
    .sort((a, b) => b.len - a.len);
```

- [ ] **Step 8: Phenological-trend clarity (item 9)** — card 9: replace its `<h3>` text with `Сдвиг пика во времени (недель за год)` and the caption `<p className={css.ci}>` with:
```tsx
                  Линейный тренд медианной недели пика по годам. Отрицательное
                  значение — пик из года в год смещается раньше (на N недель в
                  год); положительное — позже. Это разведочная оценка по
                  короткому ряду (&le;8 лет), не прогноз.
```
Keep the existing `.note` line.

- [ ] **Step 9: Early/late clarity + window note (item 13)** — card 13: caption →
```tsx
                  Взвешенная средняя неделя всех находок сезона (только недели
                  &ge;20 — настоящий сезон, без зимнего шума «прошлогодних»
                  постов). Меньше = грибы пошли раньше в этом году.
```

- [ ] **Step 10: Season-volume normalised by corpus (item 14)** — replace `volumeData` (lines ~354-359) + card-14 body. Use `findsPerPost` from the updated `yearRanking` (Task 3):
```tsx
  // 14. season volume normalised by corpus size (finds per post)
  const maxFpp = Math.max(...ranking.map((r) => r.findsPerPost), 1e-9);
  const volumeData = ranking.map((r) => ({
    year: String(r.year),
    fpp: Math.round((r.findsPerPost / maxFpp) * 100) / 100,
  }));
```
Card-14 `<BarChart>` `valueKey="share"` → `valueKey="fpp"`. Replace card-14 caption + note:
```tsx
                <p className={css.ci}>
                  Находок на один пост (нормировано к лучшему году). Делёж на
                  объём постов убирает рост самого сообщества — остаётся
                  «насколько богат был сезон», а не «сколько народу в ВК».
                </p>
```
and replace the trailing `.note` with:
```tsx
                <p className={css.note}>
                  Прокси по ВК-корпусу, не полевой учёт; короткий ряд —
                  интерпретировать осторожно.
                </p>
```

- [ ] **Step 11: tsc + commit**

Run: `cd apps/web && npx tsc --noEmit && cd ../..` → clean (watch for unused `COMPOSITION_COLORS` removal, and that `ranking` is defined before `volumeData`).
```bash
git add apps/web/src/routes/stats/SeasonalityTab.tsx
git commit -m "feat(stats/season): VK link, calendar X, species colours, sort, clearer captions, posts-normalised volume"
```

---

## Task 7: Per-card pill state + fixed-norm Y + anomaly DivergingBarChart (items 3, 16, 17)

**Files:**
- Modify: `apps/web/src/routes/stats/SeasonalityTab.tsx`

- [ ] **Step 1: Independent species/year state per card (item 3)**

Today a single `selSpecies`/`selYear` (lines ~192-193) feeds cards 2, 3, 5, 15, 16 — changing one changes all. Give each interactive card its own state. After the existing `completeSeason` line add:
```tsx
  const [spProfile, setSpProfile] = useState(defaultSpecies);   // card 2
  const [spHeat, setSpHeat] = useState<string>(defaultSpecies);  // card 3 (+ "all")
  const [spCum, setSpCum] = useState(defaultSpecies);            // card 5
  const [yrCum, setYrCum] = useState(completeSeason);
  const [spVsN, setSpVsN] = useState(defaultSpecies);            // card 15
  const [yrVsN, setYrVsN] = useState(completeSeason);
  const [spAnom, setSpAnom] = useState(defaultSpecies);          // card 16
  const [yrAnom, setYrAnom] = useState(completeSeason);
```
Delete the old `const [selSpecies,…]` / `const [selYear,…]` lines. Then update each card's derived data + pills + guards to use its own state:
- card 2 (`speciesCurves`, `isQualifying` for it): compute `const isQualProfile = qualifyingItems.some(i => i.species_key === spProfile);` use `spProfile`; Pills `value={spProfile} onChange={setSpProfile}`.
- card 3 (`matrix`): `matrixSpecies = spHeat`; Pills `value={spHeat} onChange={setSpHeat}`.
- card 5 (`cumRaw`): use `spCum`,`yrCum`; its `isQualifying` → `qualifyingItems.some(i=>i.species_key===spCum)`; both Pills wired to spCum/yrCum.
- card 15 (`vsNormRaw`): use `spVsN`,`yrVsN`; Pills wired; partial-year note uses `yrVsN`.
- card 16 (`anomalyRaw`): use `spAnom`,`yrAnom`; Pills wired.
Each card recomputes its own `isQual*` boolean inline; the shared `notQualifyingNote` JSX is reused. (Mechanical: the transforms `yearCurves/weekYearMatrix/cumulativeShare/currentVsNorm/weeklyAnomaly` already take an explicit species/year arg — only the variable passed changes.)

- [ ] **Step 2: card 15 — fixed norm Y domain (item 17)**

The norm band is year-independent in data (Task 3 Step 5) but the MultiLineChart auto-scales Y to the selected year's magnitude, so the fixed band visually "moves". Add a `yDomain?: [number, number]` prop to `MultiLineChart` (same pattern as AreaChart): in `MultiLineChart.tsx` add `yDomain?: [number, number];` to props, destructure, set `<YAxis ... domain={yDomain} allowDataOverflow={yDomain !== undefined} />`. Then in `SeasonalityTab` card 15 compute a stable domain from the **norm** (all-years, year-independent) plus a headroom for the year line:
```tsx
  const vsNormYMax = Math.max(
    1,
    ...vsNormData.flatMap((d) => [d.p75 ?? 0, d.mean ?? 0, d.value ?? 0]),
  );
```
and pass `yDomain={[0, Math.ceil(vsNormYMax * 1.1)]}` to card-15 `<MultiLineChart>`. (Domain derived from data incl. norm p75, so the band keeps a constant pixel position across years; the year line is clamped with `allowDataOverflow`.) Commit MultiLineChart change with this task.

- [ ] **Step 3: card 16 — DivergingBarChart, colour by sign (item 16)**

`DivergingBarChart` already does per-bar sign colouring via `<Cell>`. Replace the card-16 `<BarChart>`+apologetic `.note` block with:
```tsx
                  <>
                    <DivergingBarChart
                      data={anomalyData}
                      categoryKey="week"
                      valueKey="delta"
                      colorPos="var(--idx-1)"
                      colorNeg="var(--chanterelle)"
                      height={Math.max(260, anomalyData.length * 16 + 40)}
                    />
                    <p className={css.note}>
                      Зелёные недели — выше нормы, терракотовые — ниже.
                    </p>
                  </>
```
Add `import { DivergingBarChart } from "../../components/stats/charts/DivergingBarChart";` to the chart imports.

- [ ] **Step 4: tsc + commit**

Run: `cd apps/web && npx tsc --noEmit && cd ../..` → clean.
```bash
git add apps/web/src/routes/stats/SeasonalityTab.tsx apps/web/src/components/stats/charts/MultiLineChart.tsx
git commit -m "fix(stats/season): per-card pill state, fixed-norm Y domain, anomaly diverging bars"
```

---

## Task 8: Layout — 2-up grid + sticky section TOC

**Files:**
- Modify: `apps/web/src/components/stats/season/SeasonCharts.module.css`
- Modify: `apps/web/src/routes/stats/SeasonalityTab.tsx`

- [ ] **Step 1: Read the current layout CSS** — `apps/web/src/components/stats/season/SeasonCharts.module.css`. Note the existing `.section`, `.grid`, `.card`, `.h` rules (the grid is currently 1-column).

- [ ] **Step 2: 2-column grid for compact cards** — in `SeasonCharts.module.css` make `.grid` responsive 2-up and add a `.cardWide` that spans both columns (for the big multi-series/heatmap cards that need width):
```css
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}
.cardWide { grid-column: 1 / -1; }
@media (max-width: 880px) {
  .grid { grid-template-columns: 1fr; }
  .cardWide { grid-column: auto; }
}
```
(If `.grid` already sets `display:grid` with 1 col, replace those lines; keep other `.grid` props.)

- [ ] **Step 3: Mark wide cards** — in `SeasonalityTab.tsx`, for the cards that need full width add `${css.cardWide}` to their `className`: card 1 (Годовой профиль), card 3 (тепловая карта), card 6 (состав корзины), card 12 (лента года), card 15 (год vs норма). Pattern: `className={`${css.card} ${css.cardWide}`}`. All other cards keep `className={css.card}` and auto-flow 2-up.

- [ ] **Step 4: Sticky section TOC** — add a left-rail anchor list. In `SeasonCharts.module.css` add:
```css
.layout { display: grid; grid-template-columns: 180px 1fr; gap: var(--space-5); align-items: start; }
.toc { position: sticky; top: var(--space-5); display: flex; flex-direction: column; gap: var(--space-2);
       font-family: var(--font-mono); font-size: var(--fs-xs); }
.tocLink { color: var(--ink-faint); text-decoration: none; padding: 2px 0; }
.tocLink:hover { color: var(--chanterelle); }
@media (max-width: 880px) { .layout { grid-template-columns: 1fr; } .toc { display: none; } }
```
In `SeasonalityTab.tsx` wrap the four `<section>`s: give each `<section>` an `id` (`id="s-shape"`, `s-peak`, `s-compare`, `s-year`) and wrap them with the TOC:
```tsx
      <div className={css.layout}>
        <nav className={css.toc} aria-label="Разделы">
          <a className={css.tocLink} href="#s-shape">Форма сезона</a>
          <a className={css.tocLink} href="#s-peak">Пик и стабильность</a>
          <a className={css.tocLink} href="#s-compare">Сравнение</a>
          <a className={css.tocLink} href="#s-year">Год к году</a>
        </nav>
        <div>
          {/* existing four <section> blocks, each with its id */}
        </div>
      </div>
```
(Keep the intro `<p>` above `.layout`. Anchor scrolling is native; no JS.)

- [ ] **Step 5: tsc + commit**

Run: `cd apps/web && npx tsc --noEmit && cd ../..` → clean.
```bash
git add apps/web/src/components/stats/season/SeasonCharts.module.css apps/web/src/routes/stats/SeasonalityTab.tsx
git commit -m "feat(stats/season): 2-up card grid + sticky section TOC"
```

---

## Task 9: Mandatory per-card visual-QA loop

**Files:** none (verification + fix iterations only). Controller-owned, like the Лес/Погода loops.

- [ ] **Step 1: Rebuild snapshot + restart API** (transforms read it; Task 3 changed nothing in SQL but yearRanking now needs `posts` which the season endpoint already returns — confirm):
```bash
C:/Users/ikoch/mushroom-map/.venv/Scripts/python.exe pipelines/build_stats_snapshot.py
```
Restart the worktree API (`uvicorn api.main:app` on :8000) and confirm `curl -s 'http://127.0.0.1:8000/api/stats/season/curves?species=all' | head -c 200` returns `posts` in `weeks[]`.

- [ ] **Step 2: Per-card capture** — write `C:/tmp/season_qa.cjs` (playwright, `require("playwright")`, run from `/c/tmp`): goto `http://localhost:5173/stats?tab=seasonality`, waitUntil networkidle + 7s, enumerate every `.card` (h3 inside), `element.screenshot()` each to `C:/tmp/season_NN.png`, log card index+title+height, print `ERRS` + `QA_DONE`. Capture **per-card at full resolution** — NEVER a single downscaled fullPage (that is the exact failure that let these 17 defects through; see memory feedback_per_card_visual_qa.md).

- [ ] **Step 3: Eyes-on every card** — Read every `C:/tmp/season_NN.png` at full size. For each, verify the specific fix landed and look for NEW regressions:
  - card1/2: X shows month labels not week numbers; lines continuous (no gaps); tooltip values 2dp.
  - card3: heatmap — no overlapping numbers (rounded ints or text hidden when dense); labels not clipped.
  - card5: cumulative S-curve continuous; X = months.
  - card6: composition colours match species identity (chanterelle gold, porcini beige, aspen orange-red…); hover shows `%`.
  - card8: bars sorted by length.
  - card9: title/caption explain the metric.
  - card11: NO porcini band in March (off-season months muted); colours species-bound.
  - card12: ridges visually separated (not stacked on top of each other); per-species colours; caption explains it.
  - card13: caption explains window; bars sane.
  - card14: finds-per-post normalised; caption explains; values plausible.
  - card15: norm band stays in a constant position across year toggles; lines continuous.
  - card16: bars coloured by sign (pos vs neg different colour); no apologetic note.
  - all heatmaps/tables: no text collision/overflow.
  - layout: compact cards 2-per-row, wide cards full width, left TOC sticky and anchors jump.
- [ ] **Step 4: Compile defect list, dispatch fix subagent(s), re-capture, re-verify.** Loop until every card is clean by the controller's own eyes. Commit each fix (not pushed).

- [ ] **Step 5: Final exit-state** — append an Exit-state section to this plan (tasks done, commit SHAs, branch unpushed, deploy note: rerun `build_stats_snapshot.py` on TimeWeb+Oracle prod DBs since item 14 uses `posts` already in the snapshot — no schema change, but a rebuild aligns prod with the new transforms). Update memory `project_stats_section.md` + `MEMORY.md`.

---

## Self-Review

**1. Spec coverage:** 17 user items + layout all mapped (see punch-list→task map at top); every item has a concrete task/step. ✔

**2. Placeholder scan:** every code step has literal code; tests have real assertions; no "TBD/handle edge cases". The only judgement-coded decisions (colour hexes, 1%-annual March floor, week-20 season start, finds-per-post normalisation, ridge overlap 22→14) are stated with rationale, not deferred. ✔

**3. Type consistency:** `yearRanking` return gains `findsPerPost` (Task 3) consumed in Task 6 Step 10 (`r.findsPerPost`). `weekMonthLabel` defined Task 4, used Task 6. `SPECIES_COLOR`/`speciesColor` defined Task 5, used Task 6. New chart props (`connectNulls`,`xTickFormatter`,`tooltipDecimals`,`tooltipPercent`,`yDomain`) defined Task 1/2/7, used Task 6/7. `--sp-*` tokens defined Task 5, referenced by speciesColors.ts same task. `.cardWide`/`.layout`/`.toc` defined Task 8 CSS, used Task 8 TSX. No dangling refs. ✔

**4. Decisions stated (autonomous, user delegated "придумай"/"найди способ"):** species palette = naturalistic per-group hexes; popularity normalisation = finds-per-post within season window (divides out corpus growth, data already in `stats_season_week.posts`); calendar X = sparse RU month labels at month-start weeks; ridge fix = reduce overlap + per-species colour; March artefact = absolute 1%-of-annual volume floor. All reversible/token-based.

---

## Exit-state (2026-05-18) — ALL TASKS DONE, branch unpushed

Tasks 1–9 complete via subagent-driven-development. Branch
`claude/upbeat-archimedes-da0d9c`, **not pushed** (autonomous-review
mandate). Commits: plan `34a926e`; impl `92667c5` (chart props) ·
`da39528` (heatmap/ridge legibility) · `39d50cd` (transforms: March
floor + season-window/posts ranking + pinned norm, TDD) · `09d1f5b`
(weekMonthLabel) · `eceb8b6` (species colour tokens+map) · `cde7ef9`
(SeasonalityTab wiring) · `d93fec4` (per-card pill state + fixed-norm Y
+ diverging anomaly) · `16bc501` (2-up grid + sticky TOC) ; QA-loop
fixes `3f0087b` (DF-1 reliable month X ticks + DF-2 diverging
phenology) · `127defd` (DF-3 unclip phenology labels). vitest 103/103,
tsc clean throughout.

**Per-card visual-QA (Task 9) — DONE, controller eyes-on every one of
16 cards at full resolution** (NOT downscaled fullPage — the failure
mode that let the original 17 defects through; see
feedback_per_card_visual_qa.md). All 17 user items verified fixed:
calendar month X (all line charts, numeric fixed ticks), 2dp tooltips,
VK group link, per-card independent species/year pills, no line gaps
(connectNulls), heatmap text rounded + density-suppressed (no
collisions), canonical species→colour binding (composition + ridge),
%-tooltip, season-length sorted, clearer phenology/early-late/volume
captions, porcini-March artefact gone (1%-annual floor), ridge
separated+coloured+explained, finds-per-post corpus-normalised volume,
year-independent fixed-Y norm band, anomaly + phenology diverging
(sign-coloured), 2-up grid + sticky section TOC. 3 QA-loop regressions
(DF-1 unreliable month labels, DF-2 monochrome signed phenology bars,
DF-3 clipped species labels on the new DivergingBarChart) found and
fixed in-loop.

**Deploy when approved:** push → merge → no schema/snapshot change
needed (item 14 uses `stats_season_week.posts` already present); a
`build_stats_snapshot.py` rerun on TimeWeb+Oracle prod DBs is only for
freshness alignment, not correctness. New `--sp-*` tokens ship with the
frontend build.
