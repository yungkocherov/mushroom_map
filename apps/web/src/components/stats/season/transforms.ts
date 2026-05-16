/**
 * transforms.ts — pure, deterministic data-transform functions for the
 * Seasonality (/stats) section. No React, no fetch, no Date()/Math.random().
 *
 * Every chart in Task 9 derives from these functions. Correctness is
 * verified by transforms.test.ts (vitest TDD).
 *
 * Contract: never throw, never return NaN. Guard all divisions by zero.
 * Never mutate inputs. Handle empty arrays -> empty / zeroed output.
 */

import type {
  SeasonCurvesResponse,
  SeasonNormPoint,
  SeasonWeekPoint,
  SeasonSpeciesResponse,
} from "@mushroom-map/api-client";

// ─── constants ────────────────────────────────────────────────────────────

export const MONTHS_RU = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
] as const;

/** Top-7 species groups by corpus volume; everything else folds into 'other'. */
export const SEASON_GROUP_KEYS = [
  "porcini",
  "aspen_bolete",
  "pine_bolete",
  "chanterelle",
  "fly_agaric",
  "spring_mushroom",
  "honey_fungus",
] as const;

type GroupKey = (typeof SEASON_GROUP_KEYS)[number] | "other";

// ─── weekToMonthIdx ───────────────────────────────────────────────────────

/**
 * Maps ISO week (1..53) to month index 0..11.
 * Approximation: floor((week-1) / 4.345), clamped to [0, 11].
 */
export function weekToMonthIdx(week: number): number {
  const idx = Math.floor((week - 1) / 4.345);
  return Math.max(0, Math.min(11, idx));
}

// ─── smooth7 ─────────────────────────────────────────────────────────────

/**
 * Centered moving average, window of 3 (i-1, i, i+1).
 * Edge elements use available neighbors (window of 2).
 * Preserves array length. Idempotent on constant arrays. No NaN.
 */
export function smooth7(values: number[]): number[] {
  if (values.length === 0) return [];
  if (values.length === 1) return [values[0]];

  const n = values.length;
  const result = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - 1);
    const hi = Math.min(n - 1, i + 1);
    let sum = 0;
    let count = 0;
    for (let j = lo; j <= hi; j++) {
      sum += values[j];
      count++;
    }
    result[i] = sum / count;
  }

  return result;
}

// ─── internal helpers ─────────────────────────────────────────────────────

/**
 * Accumulate raw finds per (year, week) for a given species key or 'all'.
 * Returns a Map keyed by `${year}:${week}` -> finds total.
 * Also produces sorted unique year and week lists.
 */
function accumulateRaw(
  weeks: SeasonWeekPoint[],
  species: string,
): {
  byYearWeek: Map<string, number>;
  years: number[];
  allWeeks: number[];
} {
  const filtered = species === "all"
    ? weeks
    : weeks.filter(p => p.species_key === species);

  const byYearWeek = new Map<string, number>();
  const yearSet = new Set<number>();
  const weekSet = new Set<number>();

  for (const p of filtered) {
    yearSet.add(p.year);
    weekSet.add(p.week);
    const key = `${p.year}:${p.week}`;
    byYearWeek.set(key, (byYearWeek.get(key) ?? 0) + p.finds);
  }

  const years = [...yearSet].sort((a, b) => a - b);
  const allWeeks = [...weekSet].sort((a, b) => a - b);

  return { byYearWeek, years, allWeeks };
}

/**
 * For a single year, produce sorted raw finds array (one per week in that year),
 * then apply smooth7. Returns { week, finds }[] in ascending week order.
 */
function smoothedYearPoints(
  byYearWeek: Map<string, number>,
  year: number,
  weeksForYear: number[],
): { week: number; finds: number }[] {
  if (weeksForYear.length === 0) return [];
  const raw = weeksForYear.map(w => byYearWeek.get(`${year}:${w}`) ?? 0);
  const smoothed = smooth7(raw);
  return weeksForYear.map((w, i) => ({ week: w, finds: smoothed[i] }));
}

// ─── yearCurves ───────────────────────────────────────────────────────────

/**
 * Returns per-year smoothed finds curves.
 * For species='all', sums finds across all species per (year, week) before smoothing.
 */
export function yearCurves(
  c: SeasonCurvesResponse,
  species: string,
): { year: number; points: { week: number; finds: number }[] }[] {
  const { byYearWeek, years } = accumulateRaw(c.weeks, species);

  if (years.length === 0) return [];

  return years.map(year => {
    // Collect weeks present for this year
    const weeksForYear: number[] = [];
    for (const [key] of byYearWeek) {
      const [kyStr, kwStr] = key.split(":");
      if (Number(kyStr) === year) weeksForYear.push(Number(kwStr));
    }
    weeksForYear.sort((a, b) => a - b);
    const points = smoothedYearPoints(byYearWeek, year, weeksForYear);
    return { year, points };
  });
}

// ─── weekYearMatrix ───────────────────────────────────────────────────────

/**
 * Returns a matrix of smoothed finds indexed by [yearIdx][weekIdx].
 * Null where (year, week) combination is absent in the data.
 */
export function weekYearMatrix(
  c: SeasonCurvesResponse,
  species: string,
): { years: number[]; weeks: number[]; values: (number | null)[][] } {
  const { byYearWeek, years, allWeeks } = accumulateRaw(c.weeks, species);

  if (years.length === 0) {
    return { years: [], weeks: [], values: [] };
  }

  // For each year, compute smoothed values at its own present weeks
  const smoothedByYear = new Map<number, Map<number, number>>();
  for (const year of years) {
    const weeksForYear: number[] = [];
    for (const [key] of byYearWeek) {
      const [kyStr, kwStr] = key.split(":");
      if (Number(kyStr) === year) weeksForYear.push(Number(kwStr));
    }
    weeksForYear.sort((a, b) => a - b);
    const pts = smoothedYearPoints(byYearWeek, year, weeksForYear);
    const wkMap = new Map<number, number>();
    for (const pt of pts) wkMap.set(pt.week, pt.finds);
    smoothedByYear.set(year, wkMap);
  }

  const values: (number | null)[][] = years.map(year => {
    const wkMap = smoothedByYear.get(year)!;
    return allWeeks.map(w => {
      const v = wkMap.get(w);
      return v !== undefined ? v : null;
    });
  });

  return { years, weeks: allWeeks, values };
}

// ─── cumulativeShare ──────────────────────────────────────────────────────

/**
 * Cumulative finds share within a given year for a given species.
 * Returns [] if year has no data. Last entry share is ~1.
 */
export function cumulativeShare(
  c: SeasonCurvesResponse,
  species: string,
  year: number,
): { week: number; share: number }[] {
  const { byYearWeek } = accumulateRaw(c.weeks, species);

  const weeksForYear: number[] = [];
  for (const [key] of byYearWeek) {
    const [kyStr, kwStr] = key.split(":");
    if (Number(kyStr) === year) weeksForYear.push(Number(kwStr));
  }
  weeksForYear.sort((a, b) => a - b);

  if (weeksForYear.length === 0) return [];

  const raw = weeksForYear.map(w => byYearWeek.get(`${year}:${w}`) ?? 0);
  const smoothed = smooth7(raw);

  const total = smoothed.reduce((s, v) => s + v, 0);
  if (total === 0) {
    return weeksForYear.map(w => ({ week: w, share: 0 }));
  }

  let cumSum = 0;
  return weeksForYear.map((w, i) => {
    cumSum += smoothed[i];
    return { week: w, share: cumSum / total };
  });
}

// ─── compositionByWeek ────────────────────────────────────────────────────

/**
 * Per ISO-week composition by group (SEASON_GROUP_KEYS + 'other').
 * Sums finds over all years, then normalizes to shares.
 * Empty week -> all zeros (no division by zero).
 */
export function compositionByWeek(
  c: SeasonCurvesResponse,
): { week: number; shares: Record<string, number> }[] {
  const allGroupKeys: GroupKey[] = [...SEASON_GROUP_KEYS, "other"];

  // Accumulate total finds per (week, group) across all years
  const weekGroupTotals = new Map<number, Map<GroupKey, number>>();

  for (const p of c.weeks) {
    const group: GroupKey = (SEASON_GROUP_KEYS as readonly string[]).includes(p.species_key)
      ? (p.species_key as GroupKey)
      : "other";

    if (!weekGroupTotals.has(p.week)) {
      weekGroupTotals.set(p.week, new Map<GroupKey, number>());
    }
    const gMap = weekGroupTotals.get(p.week)!;
    gMap.set(group, (gMap.get(group) ?? 0) + p.finds);
  }

  const sortedWeeks = [...weekGroupTotals.keys()].sort((a, b) => a - b);

  return sortedWeeks.map(week => {
    const gMap = weekGroupTotals.get(week)!;
    const total = [...gMap.values()].reduce((s, v) => s + v, 0);

    const shares: Record<string, number> = {};
    for (const key of allGroupKeys) {
      const v = gMap.get(key) ?? 0;
      shares[key] = total > 0 ? v / total : 0;
    }
    return { week, shares };
  });
}

// ─── peakBoxData ──────────────────────────────────────────────────────────

/**
 * For each species in SeasonSpeciesResponse, extract peak box data.
 * Qualifying species come first (sorted by peak asc, nulls last within qualifying).
 * Non-qualifying come after.
 */
export function peakBoxData(
  s: SeasonSpeciesResponse,
): { species_key: string; label: string; peak: number | null; iqr: number | null; qualifies: boolean }[] {
  const qualifying = s.items
    .filter(item => item.qualifies)
    .sort((a, b) => {
      // nulls last within qualifying
      if (a.peak_week_median === null && b.peak_week_median === null) return 0;
      if (a.peak_week_median === null) return 1;
      if (b.peak_week_median === null) return -1;
      return a.peak_week_median - b.peak_week_median;
    });

  const nonQualifying = s.items.filter(item => !item.qualifies);

  return [...qualifying, ...nonQualifying].map(item => ({
    species_key: item.species_key,
    label: item.label,
    peak: item.peak_week_median,
    iqr: item.peak_week_iqr,
    qualifies: item.qualifies,
  }));
}

// ─── seasonBands ──────────────────────────────────────────────────────────

/**
 * Per qualifying species: start/end ISO week at 10%/90% of cumulative norm total.
 * mark = peak_week_median. Ordered by start.
 */
export function seasonBands(
  c: SeasonCurvesResponse,
  s: SeasonSpeciesResponse,
): { label: string; species_key: string; start: number; end: number; mark: number | null }[] {
  const qualifying = s.items.filter(item => item.qualifies);

  const results: { label: string; species_key: string; start: number; end: number; mark: number | null }[] = [];

  for (const species of qualifying) {
    const normPoints = c.norm
      .filter(n => n.species_key === species.species_key)
      .sort((a, b) => a.week - b.week);

    if (normPoints.length === 0) continue;

    const total = normPoints.reduce((s, n) => s + n.finds_mean, 0);
    if (total === 0) continue;

    // Find start: first week where cumulative >= 10%
    let cumSum = 0;
    let start: number | null = null;
    let end: number | null = null;

    for (const n of normPoints) {
      cumSum += n.finds_mean;
      const share = cumSum / total;
      if (start === null && share >= 0.1) {
        start = n.week;
      }
      if (share >= 0.9) {
        end = n.week;
        break;
      }
    }

    if (start === null) start = normPoints[0].week;
    if (end === null) end = normPoints[normPoints.length - 1].week;

    results.push({
      label: species.label,
      species_key: species.species_key,
      start,
      end,
      mark: species.peak_week_median,
    });
  }

  return results.sort((a, b) => a.start - b.start);
}

// ─── ridgeDensity ─────────────────────────────────────────────────────────

/**
 * Qualifying species only. Each series is norm finds_mean normalized to its own max.
 * Ordered by peak_week_median ascending. xLabels = MONTHS_RU.
 */
export function ridgeDensity(
  c: SeasonCurvesResponse,
  s: SeasonSpeciesResponse,
): { series: { label: string; values: number[] }[]; xLabels: string[] } {
  const qualifying = s.items
    .filter(item => item.qualifies)
    .sort((a, b) => {
      if (a.peak_week_median === null && b.peak_week_median === null) return 0;
      if (a.peak_week_median === null) return 1;
      if (b.peak_week_median === null) return -1;
      return a.peak_week_median - b.peak_week_median;
    });

  const series: { label: string; values: number[] }[] = [];

  for (const sp of qualifying) {
    const normPoints = c.norm
      .filter(n => n.species_key === sp.species_key)
      .sort((a, b) => a.week - b.week);

    if (normPoints.length === 0) continue;

    const rawValues = normPoints.map(n => n.finds_mean);
    const maxVal = Math.max(...rawValues);

    const values = maxVal > 0
      ? rawValues.map(v => v / maxVal)
      : rawValues.map(() => 0);

    series.push({ label: sp.label, values });
  }

  return { series, xLabels: [...MONTHS_RU] };
}

// ─── yearRanking ──────────────────────────────────────────────────────────

/**
 * Per year, sum(week * smoothedFinds) / sum(smoothedFinds) weighted mean week.
 * Plus total smoothed finds. Sorted by year ascending.
 */
export function yearRanking(
  c: SeasonCurvesResponse,
): { year: number; weightedMeanWeek: number; total: number }[] {
  const { byYearWeek, years } = accumulateRaw(c.weeks, "all");

  if (years.length === 0) return [];

  return years.map(year => {
    const weeksForYear: number[] = [];
    for (const [key] of byYearWeek) {
      const [kyStr, kwStr] = key.split(":");
      if (Number(kyStr) === year) weeksForYear.push(Number(kwStr));
    }
    weeksForYear.sort((a, b) => a - b);

    const pts = smoothedYearPoints(byYearWeek, year, weeksForYear);

    let weightedSum = 0;
    let totalFinds = 0;
    for (const pt of pts) {
      weightedSum += pt.week * pt.finds;
      totalFinds += pt.finds;
    }

    return {
      year,
      weightedMeanWeek: totalFinds > 0 ? weightedSum / totalFinds : 0,
      total: totalFinds,
    };
  });
}

// ─── currentVsNorm ────────────────────────────────────────────────────────

/**
 * Chosen year's smoothed finds vs norm band, joined by week.
 */
export function currentVsNorm(
  c: SeasonCurvesResponse,
  species: string,
  year: number,
): { week: number; value: number; mean: number; p25: number; p75: number }[] {
  const { byYearWeek } = accumulateRaw(c.weeks, species);

  const weeksForYear: number[] = [];
  for (const [key] of byYearWeek) {
    const [kyStr, kwStr] = key.split(":");
    if (Number(kyStr) === year) weeksForYear.push(Number(kwStr));
  }
  weeksForYear.sort((a, b) => a - b);

  if (weeksForYear.length === 0) return [];

  const raw = weeksForYear.map(w => byYearWeek.get(`${year}:${w}`) ?? 0);
  const smoothed = smooth7(raw);

  // Build norm lookup
  const normByWeek = new Map<number, SeasonNormPoint>();
  const normFilter = species === "all"
    ? c.norm
    : c.norm.filter(n => n.species_key === species);
  for (const n of normFilter) {
    normByWeek.set(n.week, n);
  }

  const result: { week: number; value: number; mean: number; p25: number; p75: number }[] = [];

  for (let i = 0; i < weeksForYear.length; i++) {
    const w = weeksForYear[i];
    const normPt = normByWeek.get(w);
    if (!normPt) continue;
    result.push({
      week: w,
      value: smoothed[i],
      mean: normPt.finds_mean,
      p25: normPt.finds_p25,
      p75: normPt.finds_p75,
    });
  }

  return result;
}

// ─── weeklyAnomaly ────────────────────────────────────────────────────────

/**
 * (year smoothed finds) - (norm finds_mean) per week.
 */
export function weeklyAnomaly(
  c: SeasonCurvesResponse,
  species: string,
  year: number,
): { week: number; delta: number }[] {
  const vs = currentVsNorm(c, species, year);
  return vs.map(p => ({ week: p.week, delta: p.value - p.mean }));
}

// ─── overlapMatrix ────────────────────────────────────────────────────────

/**
 * Pairwise Jaccard-style overlap: sum_w min(a_w, b_w) / sum_w max(a_w, b_w).
 * Uses NORM data. Qualifying species only. Symmetric, diagonal=1.
 */
export function overlapMatrix(
  c: SeasonCurvesResponse,
  s: SeasonSpeciesResponse,
): { species: { key: string; label: string }[]; values: number[][] } {
  const qualifying = s.items.filter(item => item.qualifies);

  // For each species, build week -> finds_mean map from norm
  const normMaps: Map<number, number>[] = qualifying.map(sp => {
    const m = new Map<number, number>();
    for (const n of c.norm) {
      if (n.species_key === sp.species_key) {
        m.set(n.week, n.finds_mean);
      }
    }
    return m;
  });

  // Collect union of all weeks across qualifying species
  const weekSet = new Set<number>();
  for (const m of normMaps) {
    for (const w of m.keys()) weekSet.add(w);
  }
  const weeks = [...weekSet].sort((a, b) => a - b);

  const n = qualifying.length;
  const values: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (__, j) => {
      if (i === j) return 1;

      let sumMin = 0;
      let sumMax = 0;
      for (const w of weeks) {
        const a = normMaps[i].get(w) ?? 0;
        const b = normMaps[j].get(w) ?? 0;
        sumMin += Math.min(a, b);
        sumMax += Math.max(a, b);
      }
      return sumMax > 0 ? sumMin / sumMax : 0;
    }),
  );

  return {
    species: qualifying.map(sp => ({ key: sp.species_key, label: sp.label })),
    values,
  };
}

// ─── monthSpeciesShare ────────────────────────────────────────────────────

/**
 * Aggregates finds by month (via weekToMonthIdx) and group.
 * values[monthIdx][groupIdx] = group's share of that month's total finds.
 * groups = SEASON_GROUP_KEYS + 'other'.
 * Empty month -> all zeros.
 */
export function monthSpeciesShare(c: SeasonCurvesResponse): {
  months: string[];
  species: string[];
  values: number[][];
} {
  const allGroupKeys: GroupKey[] = [...SEASON_GROUP_KEYS, "other"];

  // Accumulate raw finds per (monthIdx, group)
  const monthGroupTotals: number[][] = Array.from(
    { length: 12 },
    () => new Array<number>(allGroupKeys.length).fill(0),
  );

  for (const p of c.weeks) {
    const monthIdx = weekToMonthIdx(p.week);
    const groupIdx = (SEASON_GROUP_KEYS as readonly string[]).includes(p.species_key)
      ? (SEASON_GROUP_KEYS as readonly string[]).indexOf(p.species_key)
      : allGroupKeys.length - 1; // 'other' is last

    monthGroupTotals[monthIdx][groupIdx] += p.finds;
  }

  // Normalize each month to shares
  const values: number[][] = monthGroupTotals.map(row => {
    const total = row.reduce((s, v) => s + v, 0);
    if (total === 0) return row.map(() => 0);
    return row.map(v => v / total);
  });

  return {
    months: [...MONTHS_RU],
    species: allGroupKeys,
    values,
  };
}
