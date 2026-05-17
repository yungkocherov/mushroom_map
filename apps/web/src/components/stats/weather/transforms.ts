/**
 * transforms.ts — pure, deterministic data-transform functions for the
 * Weather («Погода») /stats tab. No React, no fetch, no Date()/Math.random().
 *
 * Every chart in the weather tab derives from these functions. Correctness
 * is verified by transforms.test.ts (vitest TDD).
 *
 * Contract: never throw, never return NaN. Guard all divisions by zero.
 * Never mutate inputs. Handle empty arrays -> empty / zeroed output.
 * Numeric fields are nullable in the api-client rows -> coalesce to 0.
 * `fullYears` is the single gate that drops the partial-2026 row — every
 * bar/anomaly card consumes it, never the raw `year` array.
 */

import type {
  WeatherClimRow,
  WeatherYearRow,
  WeatherYmRow,
  WeatherGddRow,
  WeatherPrecipHistRow,
  WeatherDistrictRow,
  WeatherDistrictMonthRow,
} from "@mushroom-map/api-client";

// ─── constants ────────────────────────────────────────────────────────────

/** Russian month abbreviations, index 0 = January. */
export const MONTH_RU = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
] as const;

// ─── monthLabel ───────────────────────────────────────────────────────────

/**
 * RU abbreviation for a 1-based month number; out-of-range months fall
 * back to the raw number as a string (never throws).
 */
export function monthLabel(m: number): string {
  return MONTH_RU[m - 1] ?? String(m);
}

// ─── climSeries ───────────────────────────────────────────────────────────

/**
 * Cards 1-4: monthly climatology series sorted by month ascending. Each
 * nullable metric coalesces to 0; label via monthLabel. Inputs are not
 * mutated (sort runs on a copy).
 */
export function climSeries(
  clim: WeatherClimRow[],
): {
  month: number;
  label: string;
  t_mean: number;
  t_min: number;
  t_max: number;
  precip: number;
  soil_moist: number;
  p_minus_et0: number;
}[] {
  return clim
    .slice()
    .sort((a, b) => a.month - b.month)
    .map((r) => ({
      month: r.month,
      label: monthLabel(r.month),
      t_mean: r.t_mean ?? 0,
      t_min: r.t_min ?? 0,
      t_max: r.t_max ?? 0,
      precip: r.precip ?? 0,
      soil_moist: r.soil_moist ?? 0,
      p_minus_et0: r.p_minus_et0 ?? 0,
    }));
}

// ─── fullYears ────────────────────────────────────────────────────────────

/**
 * The single gate that drops the partial-2026 row. Returns only rows with
 * `is_partial === false`, sorted by year ascending. Every bar / anomaly
 * card consumes this, never the raw `year` array. Input not mutated.
 */
export function fullYears(year: WeatherYearRow[]): WeatherYearRow[] {
  return year
    .filter((r) => r.is_partial === false)
    .slice()
    .sort((a, b) => a.year - b.year);
}

// ─── ymMatrix ─────────────────────────────────────────────────────────────

/**
 * Cards 7, 8: year × month matrix (Heatmap). rows = distinct years
 * ascending as strings, cols = 1..12. values[r][c] = the chosen field for
 * (year, month), zero-filled where absent / null. Input not mutated.
 */
export function ymMatrix(
  ym: WeatherYmRow[],
  field: "t_mean" | "precip_total",
): { rows: string[]; cols: number[]; values: number[][] } {
  const cols = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const yearsSet = new Set<number>();
  const cell = new Map<string, number>();
  for (const r of ym) {
    yearsSet.add(r.year);
    cell.set(`${r.year} ${r.month}`, r[field] ?? 0);
  }

  const years = [...yearsSet].sort((a, b) => a - b);
  const rows = years.map((y) => String(y));
  const values = years.map((y) =>
    cols.map((m) => cell.get(`${y} ${m}`) ?? 0),
  );

  return { rows, cols, values };
}

// ─── gddSeries ────────────────────────────────────────────────────────────

/**
 * Card 13: cumulative GDD pivoted long -> wide. One column per year
 * (string key), x = month. Missing (year, month) cells -> 0. years =
 * distinct years ascending as strings. Input not mutated.
 */
export function gddSeries(
  gdd: WeatherGddRow[],
): {
  data: Array<{ month: number; label: string; [year: string]: number | string }>;
  years: string[];
} {
  const yearsSet = new Set<number>();
  const cell = new Map<string, number>();
  for (const r of gdd) {
    yearsSet.add(r.year);
    cell.set(`${r.year} ${r.month}`, r.gdd5_cum ?? 0);
  }

  const years = [...yearsSet].sort((a, b) => a - b);
  const yearKeys = years.map((y) => String(y));
  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const data = months.map((m) => {
    const point: { month: number; label: string; [year: string]: number | string } = {
      month: m,
      label: monthLabel(m),
    };
    for (let i = 0; i < years.length; i++) {
      point[yearKeys[i]] = cell.get(`${years[i]} ${m}`) ?? 0;
    }
    return point;
  });

  return { data, years: yearKeys };
}

// ─── precipHistBars ───────────────────────────────────────────────────────

/**
 * Card 15: summer daily-precip histogram. Sorted by bin_lo ascending,
 * label = "30+" for the open-ended top bin (bin_lo === 30), else
 * `${bin_lo}–${bin_lo + 2}` (en-dash U+2013). days passed through.
 * Input not mutated.
 */
export function precipHistBars(
  ph: WeatherPrecipHistRow[],
): { label: string; days: number }[] {
  return ph
    .slice()
    .sort((a, b) => a.bin_lo - b.bin_lo)
    .map((r) => ({
      label: r.bin_lo === 30 ? "30+" : `${r.bin_lo}–${r.bin_lo + 2}`,
      days: r.days ?? 0,
    }));
}

// ─── districtRankWeather ──────────────────────────────────────────────────

/**
 * Cards 16-18: per-district ranking by a single field, sorted DESC.
 * Rows where the field is null are dropped. Names are shortened for the
 * chart axis. Input not mutated.
 */
export function districtRankWeather(
  district: WeatherDistrictRow[],
  field: "warm_precip" | "warm_soil_moist" | "mushroom_days",
): { name: string; value: number }[] {
  const items: { name: string; value: number }[] = [];
  for (const row of district) {
    const v = row[field];
    if (v === null) continue;
    items.push({ name: shortDistrict(row.district_name), value: v });
  }
  return items.sort((a, b) => b.value - a.value);
}

// ─── districtMonthMatrix ──────────────────────────────────────────────────

/**
 * Cards 19, 20: district × month matrix (Heatmap). rows = district
 * names (by district_id ascending, shortened), cols = 1..12.
 * values[r][c] = the chosen field for (district, month), zero-filled
 * where absent / null. A district whose *every* month cell for the
 * chosen field is null/absent is omitted entirely (the snapshot emits
 * NULL for soil series degraded by the upstream model — rendering them
 * as a solid all-zero row would misrepresent absent data as a real
 * measurement). A district with only *some* missing months is kept
 * with those months zero-filled. The guard is per-field: a district
 * all-null for soil_moist but with real soil_temp stays in the
 * soil_temp matrix. `districtName` maps String(district_id) -> name.
 * Input not mutated.
 */
export function districtMonthMatrix(
  dm: WeatherDistrictMonthRow[],
  field: "soil_moist" | "soil_temp",
  districtName: Record<string, string>,
): { rows: string[]; cols: number[]; values: number[][] } {
  const cols = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const idsSet = new Set<number>();
  const hasReal = new Set<number>();
  const cell = new Map<string, number>();
  for (const r of dm) {
    idsSet.add(r.district_id);
    const v = r[field];
    if (v !== null && v !== undefined) hasReal.add(r.district_id);
    cell.set(`${r.district_id} ${r.month}`, v ?? 0);
  }

  const ids = [...idsSet]
    .filter((id) => hasReal.has(id))
    .sort((a, b) => a - b);
  const rows = ids.map((id) => districtName[String(id)] ?? String(id));
  const values = ids.map((id) =>
    cols.map((m) => cell.get(`${id} ${m}`) ?? 0),
  );

  return { rows, cols, values };
}

// ─── shortDistrict ────────────────────────────────────────────────────────

/**
 * Shortens a district name so it fits a single chart-axis line. Strips
 * trailing « район»; special-cases the two non-«район» units. Identical
 * rules to the (module-private) ForestTab helper — duplicated here
 * because that copy is not exported and lives in a route component, so
 * importing it would invert the route -> component dependency and force
 * exporting a deliberately-private presentation helper. One copy here
 * keeps the weather transforms self-contained and pure.
 */
export function shortDistrict(name: string): string {
  if (name === "Гатчинский муниципальный округ") return "Гатчинский";
  if (name === "Сосновоборский городской округ") return "Сосновоборск";
  return name.replace(/ район$/, "");
}

// ─── frostWindowItems ─────────────────────────────────────────────────────

/**
 * Card 14: frost-free window per full year (RangeBars). start =
 * last_spring_frost_doy, end = first_autumn_frost_doy, mark = start
 * (RangeBars needs a mark). Rows where either DOY is null are dropped.
 * Consumes fullYears (partial-2026 already gated out). Input not mutated.
 */
export function frostWindowItems(
  year: WeatherYearRow[],
): { label: string; start: number; end: number; mark: number }[] {
  const result: { label: string; start: number; end: number; mark: number }[] = [];
  for (const r of fullYears(year)) {
    const start = r.last_spring_frost_doy;
    const end = r.first_autumn_frost_doy;
    if (start === null || end === null) continue;
    result.push({
      label: String(r.year),
      start,
      end,
      mark: start,
    });
  }
  return result;
}
