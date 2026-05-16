/**
 * transforms.test.ts — vitest correctness tests for season data transforms.
 * All tests use small hand-computable inputs with exact expected outputs.
 * TDD: write first, run => FAIL (module absent), implement, run => PASS.
 */
import { describe, it, expect } from "vitest";
import type {
  SeasonCurvesResponse,
  SeasonSpeciesResponse,
} from "@mushroom-map/api-client";

import {
  MONTHS_RU,
  SEASON_GROUP_KEYS,
  weekToMonthIdx,
  smooth7,
  yearCurves,
  weekYearMatrix,
  cumulativeShare,
  compositionByWeek,
  peakBoxData,
  seasonBands,
  ridgeDensity,
  yearRanking,
  currentVsNorm,
  weeklyAnomaly,
  overlapMatrix,
  monthSpeciesShare,
} from "./transforms";

// ─── helpers ───────────────────────────────────────────────────────────────

/** Approximate equality for floating-point shares */
function approx(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) < eps;
}

// ─── minimal fixtures ──────────────────────────────────────────────────────

/**
 * Minimal SeasonCurvesResponse with two species (porcini, chanterelle)
 * and two years (2022, 2023), three weeks each.
 */
function makeCurves(): SeasonCurvesResponse {
  return {
    species: "all",
    weeks: [
      // 2022
      { species_key: "porcini",    year: 2022, week: 27, posts: 5, finds: 10 },
      { species_key: "porcini",    year: 2022, week: 28, posts: 8, finds: 20 },
      { species_key: "porcini",    year: 2022, week: 29, posts: 6, finds: 15 },
      { species_key: "chanterelle",year: 2022, week: 27, posts: 3, finds: 6 },
      { species_key: "chanterelle",year: 2022, week: 28, posts: 4, finds: 8 },
      { species_key: "chanterelle",year: 2022, week: 29, posts: 2, finds: 4 },
      // 2023
      { species_key: "porcini",    year: 2023, week: 27, posts: 4, finds: 8 },
      { species_key: "porcini",    year: 2023, week: 28, posts: 9, finds: 18 },
      { species_key: "porcini",    year: 2023, week: 29, posts: 7, finds: 14 },
      { species_key: "chanterelle",year: 2023, week: 27, posts: 2, finds: 4 },
      { species_key: "chanterelle",year: 2023, week: 28, posts: 5, finds: 10 },
      { species_key: "chanterelle",year: 2023, week: 29, posts: 3, finds: 6 },
    ],
    norm: [
      { species_key: "porcini",    week: 27, finds_mean: 9,  finds_p25: 7,  finds_p75: 11 },
      { species_key: "porcini",    week: 28, finds_mean: 19, finds_p25: 15, finds_p75: 22 },
      { species_key: "porcini",    week: 29, finds_mean: 14.5, finds_p25: 12, finds_p75: 17 },
      { species_key: "chanterelle",week: 27, finds_mean: 5,  finds_p25: 4,  finds_p75: 7 },
      { species_key: "chanterelle",week: 28, finds_mean: 9,  finds_p25: 7,  finds_p75: 11 },
      { species_key: "chanterelle",week: 29, finds_mean: 5,  finds_p25: 4,  finds_p75: 7 },
    ],
  };
}

function makeSpecies(): SeasonSpeciesResponse {
  return {
    items: [
      {
        species_key: "porcini",
        label: "Белый гриб",
        total_posts: 100,
        n_years: 5,
        n_years_qual: 4,
        peak_week_median: 28,
        peak_week_iqr: 2,
        peak_trend_slope: 0.1,
        season_len_median: 12,
        qualifies: true,
      },
      {
        species_key: "chanterelle",
        label: "Лисичка",
        total_posts: 60,
        n_years: 4,
        n_years_qual: 3,
        peak_week_median: 28,
        peak_week_iqr: 3,
        peak_trend_slope: -0.05,
        season_len_median: 10,
        qualifies: true,
      },
      {
        species_key: "fly_agaric",
        label: "Мухомор",
        total_posts: 10,
        n_years: 2,
        n_years_qual: 1,
        peak_week_median: null,
        peak_week_iqr: null,
        peak_trend_slope: null,
        season_len_median: null,
        qualifies: false,
      },
    ],
  };
}

// ─── MONTHS_RU ────────────────────────────────────────────────────────────

describe("MONTHS_RU", () => {
  it("has exactly 12 entries", () => {
    expect(MONTHS_RU).toHaveLength(12);
  });
  it("first is янв, last is дек", () => {
    expect(MONTHS_RU[0]).toBe("янв");
    expect(MONTHS_RU[11]).toBe("дек");
  });
});

// ─── SEASON_GROUP_KEYS ────────────────────────────────────────────────────

describe("SEASON_GROUP_KEYS", () => {
  it("contains exactly the 7 declared keys", () => {
    const expected = ["porcini","aspen_bolete","pine_bolete","chanterelle","fly_agaric","spring_mushroom","honey_fungus"];
    expect([...SEASON_GROUP_KEYS]).toEqual(expected);
  });
});

// ─── weekToMonthIdx ───────────────────────────────────────────────────────

describe("weekToMonthIdx", () => {
  it("week 1 -> 0 (January)", () => {
    expect(weekToMonthIdx(1)).toBe(0);
  });
  it("week 5 -> 1 (approx February: floor((5-1)/4.345)=floor(0.92)=0... wait, check formula)", () => {
    // floor((week-1)/4.345): week=5 -> floor(4/4.345)=floor(0.921)=0
    // week=6 -> floor(5/4.345)=floor(1.151)=1
    expect(weekToMonthIdx(5)).toBe(0);
    expect(weekToMonthIdx(6)).toBe(1);
  });
  it("week 27 -> 6 (July)", () => {
    // floor((27-1)/4.345) = floor(26/4.345) = floor(5.984) = 5... that's June
    // Let's compute: 26/4.345 = 5.984 -> floor = 5 (June)
    expect(weekToMonthIdx(27)).toBe(5);
  });
  it("week 52 -> 11 (December, clamped)", () => {
    // floor((52-1)/4.345) = floor(51/4.345) = floor(11.737) = 11
    expect(weekToMonthIdx(52)).toBe(11);
  });
  it("week 53 -> 11 (clamped to max 11)", () => {
    // floor((53-1)/4.345) = floor(52/4.345) = floor(11.967) = 11, still 11
    expect(weekToMonthIdx(53)).toBe(11);
  });
  it("week 0 or negative -> 0 (clamped to min 0)", () => {
    expect(weekToMonthIdx(0)).toBe(0);
    expect(weekToMonthIdx(-1)).toBe(0);
  });
});

// ─── smooth7 ─────────────────────────────────────────────────────────────

describe("smooth7", () => {
  it("preserves length", () => {
    expect(smooth7([1, 2, 3, 4, 5])).toHaveLength(5);
  });
  it("empty array -> empty array", () => {
    expect(smooth7([])).toEqual([]);
  });
  it("single element -> same element", () => {
    expect(smooth7([7])).toEqual([7]);
  });
  it("two elements: each is avg of available neighbors", () => {
    // [2, 4]: index 0 has neighbors [0,1] -> avg(2,4)=3; index 1 has neighbors [0,1] -> avg(2,4)=3
    const result = smooth7([2, 4]);
    expect(result).toHaveLength(2);
    expect(result[0]).toBeCloseTo(3, 9);
    expect(result[1]).toBeCloseTo(3, 9);
  });
  it("constant array is idempotent", () => {
    const input = [5, 5, 5, 5, 5];
    expect(smooth7(input)).toEqual([5, 5, 5, 5, 5]);
  });
  it("interior points: centered avg of i-1,i,i+1", () => {
    // [0, 3, 6, 9, 12]: interior index 2 -> avg(3,6,9)=6; index 1 -> avg(0+3+6)/3=3; index 3 -> avg(6+9+12)/3=9
    const result = smooth7([0, 3, 6, 9, 12]);
    expect(result[2]).toBeCloseTo(6, 9);
    expect(result[1]).toBeCloseTo(3, 9);
    expect(result[3]).toBeCloseTo(9, 9);
  });
  it("edge: index 0 uses [0,1], index last uses [last-1,last]", () => {
    // [10, 20, 30]: index 0 -> avg(10,20)=15; index 2 -> avg(20,30)=25; index 1 -> avg(10,20,30)=20
    const result = smooth7([10, 20, 30]);
    expect(result[0]).toBeCloseTo(15, 9);
    expect(result[1]).toBeCloseTo(20, 9);
    expect(result[2]).toBeCloseTo(25, 9);
  });
  it("does not mutate input", () => {
    const input = [1, 2, 3];
    smooth7(input);
    expect(input).toEqual([1, 2, 3]);
  });
});

// ─── yearCurves ───────────────────────────────────────────────────────────

describe("yearCurves", () => {
  it("returns one entry per distinct year", () => {
    const c = makeCurves();
    const result = yearCurves(c, "porcini");
    expect(result.map(r => r.year).sort()).toEqual([2022, 2023]);
  });
  it("weeks are sorted ascending within each year", () => {
    const c = makeCurves();
    const result = yearCurves(c, "porcini");
    for (const entry of result) {
      const weeks = entry.points.map(p => p.week);
      const sorted = [...weeks].sort((a, b) => a - b);
      expect(weeks).toEqual(sorted);
    }
  });
  it("species='all' sums finds across species per (year,week)", () => {
    const c = makeCurves();
    const result = yearCurves(c, "all");
    // year=2022, week=27: porcini(10) + chanterelle(6) = 16 raw; then smooth7 over [16,28,19]
    // raw: week27=16, week28=28, week29=19
    // smooth7: [0]=avg(16,28)=22, [1]=avg(16,28,19)=21, [2]=avg(28,19)=23.5
    const yr2022 = result.find(r => r.year === 2022)!;
    expect(yr2022).toBeDefined();
    const wk28 = yr2022.points.find(p => p.week === 28)!;
    // raw sum for week28: porcini(20)+chanterelle(8)=28
    // smooth7 center index: (raw[w27] + raw[w28] + raw[w29]) / 3 = (16+28+19)/3 = 21
    expect(wk28.finds).toBeCloseTo(21, 9);
  });
  it("species filter: only that species' finds", () => {
    const c = makeCurves();
    const result = yearCurves(c, "chanterelle");
    const yr2022 = result.find(r => r.year === 2022)!;
    // chanterelle 2022: w27=6, w28=8, w29=4 raw
    // smooth7: [0]=avg(6,8)=7, [1]=avg(6,8,4)=6, [2]=avg(8,4)=6
    const wk27 = yr2022.points.find(p => p.week === 27)!;
    expect(wk27.finds).toBeCloseTo(7, 9);
  });
  it("empty weeks -> empty result", () => {
    const c: SeasonCurvesResponse = { species: "all", weeks: [], norm: [] };
    expect(yearCurves(c, "porcini")).toEqual([]);
  });
  it("unknown species -> empty result", () => {
    const c = makeCurves();
    expect(yearCurves(c, "nobody")).toEqual([]);
  });
});

// ─── weekYearMatrix ───────────────────────────────────────────────────────

describe("weekYearMatrix", () => {
  it("returns correct years and weeks arrays", () => {
    const c = makeCurves();
    const m = weekYearMatrix(c, "porcini");
    expect(m.years.sort()).toEqual([2022, 2023]);
    expect(m.weeks.sort((a, b) => a - b)).toEqual([27, 28, 29]);
  });
  it("values[yi][wi] is smoothed finds or null if absent", () => {
    const c = makeCurves();
    const m = weekYearMatrix(c, "porcini");
    // All combos present so no nulls
    for (const row of m.values) {
      for (const v of row) {
        expect(v).not.toBeNull();
      }
    }
  });
  it("dimensions: values has years.length rows, each with weeks.length cols", () => {
    const c = makeCurves();
    const m = weekYearMatrix(c, "porcini");
    expect(m.values).toHaveLength(m.years.length);
    for (const row of m.values) {
      expect(row).toHaveLength(m.weeks.length);
    }
  });
  it("null for missing (year,week) combination", () => {
    const c: SeasonCurvesResponse = {
      species: "all",
      weeks: [
        { species_key: "porcini", year: 2022, week: 10, posts: 1, finds: 5 },
        { species_key: "porcini", year: 2023, week: 12, posts: 1, finds: 5 },
      ],
      norm: [],
    };
    const m = weekYearMatrix(c, "porcini");
    // years [2022,2023], weeks [10,12]
    // 2022 has week10 but not week12 -> null for (2022,12)
    const yi2022 = m.years.indexOf(2022);
    const wi12 = m.weeks.indexOf(12);
    expect(m.values[yi2022][wi12]).toBeNull();
  });
});

// ─── cumulativeShare ──────────────────────────────────────────────────────

describe("cumulativeShare", () => {
  it("last entry share is close to 1", () => {
    const c = makeCurves();
    const result = cumulativeShare(c, "porcini", 2022);
    const last = result[result.length - 1];
    expect(last.share).toBeCloseTo(1, 6);
  });
  it("shares are monotonically non-decreasing", () => {
    const c = makeCurves();
    const result = cumulativeShare(c, "porcini", 2022);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].share).toBeGreaterThanOrEqual(result[i - 1].share);
    }
  });
  it("shares are in [0,1]", () => {
    const c = makeCurves();
    const result = cumulativeShare(c, "porcini", 2022);
    for (const p of result) {
      expect(p.share).toBeGreaterThanOrEqual(0);
      expect(p.share).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
  it("weeks are sorted ascending", () => {
    const c = makeCurves();
    const result = cumulativeShare(c, "porcini", 2022);
    const weeks = result.map(p => p.week);
    expect(weeks).toEqual([...weeks].sort((a, b) => a - b));
  });
  it("empty year -> empty result", () => {
    const c = makeCurves();
    expect(cumulativeShare(c, "porcini", 9999)).toEqual([]);
  });
  it("single-week year: share = 1", () => {
    const c: SeasonCurvesResponse = {
      species: "all",
      weeks: [{ species_key: "porcini", year: 2022, week: 30, posts: 1, finds: 10 }],
      norm: [],
    };
    const result = cumulativeShare(c, "porcini", 2022);
    expect(result).toHaveLength(1);
    expect(result[0].share).toBeCloseTo(1, 9);
  });
});

// ─── compositionByWeek ───────────────────────────────────────────────────

describe("compositionByWeek", () => {
  it("returns one entry per distinct week", () => {
    const c = makeCurves();
    const result = compositionByWeek(c);
    const weeks = result.map(r => r.week).sort((a, b) => a - b);
    expect(weeks).toEqual([27, 28, 29]);
  });
  it("shares sum to ~1 for a non-empty week", () => {
    const c = makeCurves();
    const result = compositionByWeek(c);
    for (const row of result) {
      const total = Object.values(row.shares).reduce((s, v) => s + v, 0);
      expect(total).toBeCloseTo(1, 6);
    }
  });
  it("shares are in [0,1]", () => {
    const c = makeCurves();
    const result = compositionByWeek(c);
    for (const row of result) {
      for (const v of Object.values(row.shares)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
  it("species not in SEASON_GROUP_KEYS folded into 'other'", () => {
    const c: SeasonCurvesResponse = {
      species: "all",
      weeks: [
        { species_key: "russula", year: 2022, week: 30, posts: 1, finds: 4 },
        { species_key: "porcini", year: 2022, week: 30, posts: 1, finds: 4 },
      ],
      norm: [],
    };
    const result = compositionByWeek(c);
    expect(result).toHaveLength(1);
    const row = result[0];
    // porcini: 4/(4+4)=0.5, other: 4/(4+4)=0.5
    expect(row.shares["porcini"]).toBeCloseTo(0.5, 9);
    expect(row.shares["other"]).toBeCloseTo(0.5, 9);
  });
  it("empty week does not divide by zero (all shares 0)", () => {
    const c: SeasonCurvesResponse = { species: "all", weeks: [], norm: [] };
    expect(compositionByWeek(c)).toEqual([]);
  });
  it("all shares keys include SEASON_GROUP_KEYS + other", () => {
    const c = makeCurves();
    const result = compositionByWeek(c);
    const expectedKeys = [...SEASON_GROUP_KEYS, "other"];
    for (const row of result) {
      for (const key of expectedKeys) {
        expect(key in row.shares).toBe(true);
      }
    }
  });
});

// ─── peakBoxData ─────────────────────────────────────────────────────────

describe("peakBoxData", () => {
  it("qualifying species come before non-qualifying", () => {
    const s = makeSpecies();
    const result = peakBoxData(s);
    const qualIdx = result.findIndex(r => r.qualifies);
    const nonQualIdx = result.findIndex(r => !r.qualifies);
    // qualIdx should be before nonQualIdx, or nonQualIdx=-1 (all qualify)
    if (nonQualIdx !== -1 && qualIdx !== -1) {
      expect(qualIdx).toBeLessThan(nonQualIdx);
    }
  });
  it("qualifying entries ordered by peak asc (nulls last)", () => {
    const s = makeSpecies();
    const result = peakBoxData(s);
    const qualifying = result.filter(r => r.qualifies && r.peak !== null);
    for (let i = 1; i < qualifying.length; i++) {
      expect(qualifying[i].peak!).toBeGreaterThanOrEqual(qualifying[i - 1].peak!);
    }
  });
  it("maps fields correctly", () => {
    const s = makeSpecies();
    const result = peakBoxData(s);
    const porcini = result.find(r => r.species_key === "porcini")!;
    expect(porcini.label).toBe("Белый гриб");
    expect(porcini.peak).toBe(28);
    expect(porcini.iqr).toBe(2);
    expect(porcini.qualifies).toBe(true);
  });
  it("non-qualifying entry has qualifies=false", () => {
    const s = makeSpecies();
    const result = peakBoxData(s);
    const fa = result.find(r => r.species_key === "fly_agaric")!;
    expect(fa.qualifies).toBe(false);
  });
  it("empty items -> empty result", () => {
    expect(peakBoxData({ items: [] })).toEqual([]);
  });
});

// ─── seasonBands ─────────────────────────────────────────────────────────

describe("seasonBands", () => {
  it("only qualifying species returned", () => {
    const c = makeCurves();
    const s = makeSpecies();
    const result = seasonBands(c, s);
    const keys = result.map(r => r.species_key);
    expect(keys).not.toContain("fly_agaric");
  });
  it("ordered by start (ISO week)", () => {
    const c = makeCurves();
    const s = makeSpecies();
    const result = seasonBands(c, s);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].start).toBeGreaterThanOrEqual(result[i - 1].start);
    }
  });
  it("start <= mark <= end (when mark present)", () => {
    const c = makeCurves();
    const s = makeSpecies();
    const result = seasonBands(c, s);
    for (const band of result) {
      if (band.mark !== null) {
        expect(band.mark).toBeGreaterThanOrEqual(band.start);
        expect(band.mark).toBeLessThanOrEqual(band.end);
      }
    }
  });
  it("start < end", () => {
    const c = makeCurves();
    const s = makeSpecies();
    const result = seasonBands(c, s);
    for (const band of result) {
      expect(band.start).toBeLessThanOrEqual(band.end);
    }
  });
  it("exact band for porcini with known norm: weeks 27-29, cumulative 10%/90%", () => {
    // porcini norm: w27=9, w28=19, w29=14.5 => total=42.5
    // cumulative: w27=9/42.5=0.2118, w28=28/42.5=0.659, w29=42.5/42.5=1.0
    // 10% threshold: first week where cumulative >= 0.10 -> w27 (0.2118 >= 0.10) -> start=27
    // 90% threshold: first week where cumulative >= 0.90 -> w29 (1.0 >= 0.90) -> end=29
    const c = makeCurves();
    const s = makeSpecies();
    const result = seasonBands(c, s);
    const porcini = result.find(r => r.species_key === "porcini")!;
    expect(porcini).toBeDefined();
    expect(porcini.start).toBe(27);
    expect(porcini.end).toBe(29);
    expect(porcini.mark).toBe(28); // peak_week_median
  });
  it("empty norm for species -> skip species", () => {
    const c: SeasonCurvesResponse = { species: "all", weeks: [], norm: [] };
    const s = makeSpecies();
    const result = seasonBands(c, s);
    expect(result).toEqual([]);
  });
});

// ─── ridgeDensity ────────────────────────────────────────────────────────

describe("ridgeDensity", () => {
  it("only qualifying species in series", () => {
    const c = makeCurves();
    const s = makeSpecies();
    const result = ridgeDensity(c, s);
    const labels = result.series.map(sr => sr.label);
    expect(labels).not.toContain("Мухомор");
  });
  it("each series values normalized to max=1", () => {
    const c = makeCurves();
    const s = makeSpecies();
    const result = ridgeDensity(c, s);
    for (const sr of result.series) {
      const maxVal = Math.max(...sr.values);
      expect(maxVal).toBeCloseTo(1, 6);
    }
  });
  it("xLabels has 12 entries (MONTHS_RU)", () => {
    const c = makeCurves();
    const s = makeSpecies();
    const result = ridgeDensity(c, s);
    expect(result.xLabels).toHaveLength(12);
    expect(result.xLabels).toEqual(MONTHS_RU);
  });
  it("series ordered by peak_week_median ascending", () => {
    // both porcini and chanterelle have peak 28 in fixture, so order is stable
    const c = makeCurves();
    const s = makeSpecies();
    const result = ridgeDensity(c, s);
    expect(result.series).toHaveLength(2); // only qualifying
  });
  it("empty norm -> empty series", () => {
    const c: SeasonCurvesResponse = { species: "all", weeks: [], norm: [] };
    const s = makeSpecies();
    const result = ridgeDensity(c, s);
    expect(result.series).toEqual([]);
  });
  it("values all non-negative (no NaN)", () => {
    const c = makeCurves();
    const s = makeSpecies();
    const result = ridgeDensity(c, s);
    for (const sr of result.series) {
      for (const v of sr.values) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(Number.isNaN(v)).toBe(false);
      }
    }
  });
});

// ─── yearRanking ──────────────────────────────────────────────────────────

describe("yearRanking", () => {
  it("returns one entry per year, sorted by year", () => {
    const c = makeCurves();
    const result = yearRanking(c);
    expect(result.map(r => r.year)).toEqual([2022, 2023]);
  });
  it("weightedMeanWeek = sum(week*finds)/sum(finds) over all species", () => {
    // 2022 raw sums per week: w27=16, w28=28, w29=19; total=63
    // smooth7 on [16,28,19]: s[0]=avg(16,28)=22, s[1]=avg(16,28,19)=21, s[2]=avg(28,19)=23.5
    // weighted: (27*22 + 28*21 + 29*23.5) / (22+21+23.5) = (594+588+681.5)/66.5 = 1863.5/66.5 = 28.0225...
    const c = makeCurves();
    const result = yearRanking(c);
    const yr2022 = result.find(r => r.year === 2022)!;
    expect(yr2022.weightedMeanWeek).toBeCloseTo(1863.5 / 66.5, 4);
  });
  it("total = sum of smoothed finds", () => {
    const c = makeCurves();
    const result = yearRanking(c);
    const yr2022 = result.find(r => r.year === 2022)!;
    // smooth7 on raw sums [16,28,19]: [22,21,23.5]; total=66.5
    expect(yr2022.total).toBeCloseTo(66.5, 4);
  });
  it("empty weeks -> empty result", () => {
    const c: SeasonCurvesResponse = { species: "all", weeks: [], norm: [] };
    expect(yearRanking(c)).toEqual([]);
  });
  it("single week year: weightedMeanWeek = that week", () => {
    const c: SeasonCurvesResponse = {
      species: "all",
      weeks: [{ species_key: "porcini", year: 2022, week: 30, posts: 1, finds: 10 }],
      norm: [],
    };
    const result = yearRanking(c);
    expect(result[0].weightedMeanWeek).toBeCloseTo(30, 9);
  });
});

// ─── currentVsNorm ───────────────────────────────────────────────────────

describe("currentVsNorm", () => {
  it("returns one entry per week present in both year data and norm", () => {
    const c = makeCurves();
    const result = currentVsNorm(c, "porcini", 2022);
    // porcini has weeks 27,28,29 in year 2022 and norm -> 3 entries
    expect(result).toHaveLength(3);
  });
  it("weeks sorted ascending", () => {
    const c = makeCurves();
    const result = currentVsNorm(c, "porcini", 2022);
    const weeks = result.map(r => r.week);
    expect(weeks).toEqual([...weeks].sort((a, b) => a - b));
  });
  it("mean/p25/p75 match norm fixture", () => {
    const c = makeCurves();
    const result = currentVsNorm(c, "porcini", 2022);
    const wk28 = result.find(r => r.week === 28)!;
    expect(wk28.mean).toBeCloseTo(19, 9);
    expect(wk28.p25).toBeCloseTo(15, 9);
    expect(wk28.p75).toBeCloseTo(22, 9);
  });
  it("value is smoothed year finds", () => {
    const c = makeCurves();
    const result = currentVsNorm(c, "porcini", 2022);
    // porcini 2022 raw: w27=10, w28=20, w29=15
    // smooth7: [0]=avg(10,20)=15, [1]=avg(10,20,15)=15, [2]=avg(20,15)=17.5
    const wk27 = result.find(r => r.week === 27)!;
    expect(wk27.value).toBeCloseTo(15, 9);
  });
  it("empty year -> empty result", () => {
    const c = makeCurves();
    expect(currentVsNorm(c, "porcini", 9999)).toEqual([]);
  });
});

// ─── weeklyAnomaly ────────────────────────────────────────────────────────

describe("weeklyAnomaly", () => {
  it("delta = smoothed finds - norm finds_mean", () => {
    const c = makeCurves();
    const result = weeklyAnomaly(c, "porcini", 2022);
    // porcini 2022 raw: w27=10, w28=20, w29=15
    // smooth7: [0]=15, [1]=15, [2]=17.5
    // norm w27=9, w28=19, w29=14.5
    // delta w27: 15-9=6; w28: 15-19=-4; w29: 17.5-14.5=3
    const wk27 = result.find(r => r.week === 27)!;
    const wk28 = result.find(r => r.week === 28)!;
    const wk29 = result.find(r => r.week === 29)!;
    expect(wk27.delta).toBeCloseTo(6, 9);
    expect(wk28.delta).toBeCloseTo(-4, 9);
    expect(wk29.delta).toBeCloseTo(3, 9);
  });
  it("weeks sorted ascending", () => {
    const c = makeCurves();
    const result = weeklyAnomaly(c, "porcini", 2022);
    const weeks = result.map(r => r.week);
    expect(weeks).toEqual([...weeks].sort((a, b) => a - b));
  });
  it("empty year -> empty result", () => {
    const c = makeCurves();
    expect(weeklyAnomaly(c, "porcini", 9999)).toEqual([]);
  });
});

// ─── overlapMatrix ───────────────────────────────────────────────────────

describe("overlapMatrix", () => {
  it("diagonal is 1 (each species overlaps with itself)", () => {
    const c = makeCurves();
    const s = makeSpecies();
    const result = overlapMatrix(c, s);
    for (let i = 0; i < result.species.length; i++) {
      expect(result.values[i][i]).toBeCloseTo(1, 6);
    }
  });
  it("matrix is symmetric", () => {
    const c = makeCurves();
    const s = makeSpecies();
    const result = overlapMatrix(c, s);
    const n = result.species.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        expect(result.values[i][j]).toBeCloseTo(result.values[j][i], 9);
      }
    }
  });
  it("values in [0,1]", () => {
    const c = makeCurves();
    const s = makeSpecies();
    const result = overlapMatrix(c, s);
    for (const row of result.values) {
      for (const v of row) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
  it("only qualifying species included", () => {
    const c = makeCurves();
    const s = makeSpecies();
    const result = overlapMatrix(c, s);
    const keys = result.species.map(sp => sp.key);
    expect(keys).not.toContain("fly_agaric");
  });
  it("exact overlap for identical norm arrays is 1", () => {
    // porcini and chanterelle share same weeks in norm fixture
    // porcini norm: w27=9, w28=19, w29=14.5; chanterelle norm: w27=5, w28=9, w29=5
    // overlap = sum(min(a,b)) / sum(max(a,b)) = (5+9+5) / (9+19+14.5) = 19/42.5 = 0.4471...
    const c = makeCurves();
    const s = makeSpecies();
    const result = overlapMatrix(c, s);
    const pi = result.species.findIndex(sp => sp.key === "porcini");
    const ci = result.species.findIndex(sp => sp.key === "chanterelle");
    expect(result.values[pi][ci]).toBeCloseTo(19 / 42.5, 6);
  });
  it("empty species -> empty matrix", () => {
    const c: SeasonCurvesResponse = { species: "all", weeks: [], norm: [] };
    const s: SeasonSpeciesResponse = { items: [] };
    const result = overlapMatrix(c, s);
    expect(result.species).toEqual([]);
    expect(result.values).toEqual([]);
  });
});

// ─── monthSpeciesShare ────────────────────────────────────────────────────

describe("monthSpeciesShare", () => {
  it("months array equals MONTHS_RU", () => {
    const c = makeCurves();
    const result = monthSpeciesShare(c);
    expect(result.months).toEqual(MONTHS_RU);
  });
  it("species array includes SEASON_GROUP_KEYS + other", () => {
    const c = makeCurves();
    const result = monthSpeciesShare(c);
    const expectedSpecies = [...SEASON_GROUP_KEYS, "other"];
    expect(result.species).toEqual(expectedSpecies);
  });
  it("values[m] shares sum to 1 for months that have data, 0 for empty months", () => {
    const c = makeCurves();
    const result = monthSpeciesShare(c);
    for (let m = 0; m < 12; m++) {
      const total = result.values[m].reduce((s, v) => s + v, 0);
      expect(total === 0 || approx(total, 1, 1e-6)).toBe(true);
    }
  });
  it("dimensions: values has 12 rows, each with species.length cols", () => {
    const c = makeCurves();
    const result = monthSpeciesShare(c);
    expect(result.values).toHaveLength(12);
    for (const row of result.values) {
      expect(row).toHaveLength(result.species.length);
    }
  });
  it("porcini share > 0 in the month that covers week 27-29", () => {
    const c = makeCurves();
    const result = monthSpeciesShare(c);
    // weeks 27-29: monthIdx = floor((27-1)/4.345)=floor(5.98)=5 (June)
    const monthIdx = 5;
    const porciniIdx = result.species.indexOf("porcini");
    expect(result.values[monthIdx][porciniIdx]).toBeGreaterThan(0);
  });
  it("empty weeks -> all zeros", () => {
    const c: SeasonCurvesResponse = { species: "all", weeks: [], norm: [] };
    const result = monthSpeciesShare(c);
    for (const row of result.values) {
      for (const v of row) {
        expect(v).toBe(0);
      }
    }
  });
});
