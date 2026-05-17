import { describe, it, expect } from "vitest";
import {
  MONTH_RU, monthLabel, climSeries, fullYears, ymMatrix, gddSeries,
  precipHistBars, districtRankWeather, districtMonthMatrix, shortDistrict,
  frostWindowItems,
} from "./transforms";
import type {
  WeatherClimRow, WeatherYearRow, WeatherYmRow, WeatherGddRow,
  WeatherPrecipHistRow, WeatherDistrictRow, WeatherDistrictMonthRow,
} from "@mushroom-map/api-client";

function yearRow(p: Partial<WeatherYearRow> & { year: number }): WeatherYearRow {
  return {
    is_partial: false, t_mean: null, t_anom: null, precip_total: null,
    precip_anom: null, warm_days: null, warm_soil_moist: null,
    rainy_days_warm: null, snow_days: null, last_spring_frost_doy: null,
    first_autumn_frost_doy: null, ...p,
  };
}

describe("monthLabel", () => {
  it("maps 1 -> янв and is consistent with MONTH_RU", () => {
    expect(monthLabel(1)).toBe("янв");
    expect(monthLabel(8)).toBe("авг");
    expect(monthLabel(12)).toBe("дек");
    expect(MONTH_RU[0]).toBe("янв");
  });
  it("falls back to the raw number for out-of-range months", () => {
    expect(monthLabel(13)).toBe("13");
    expect(monthLabel(0)).toBe("0");
  });
});

describe("climSeries", () => {
  it("sorts by month asc and coalesces null metrics to 0", () => {
    const clim: WeatherClimRow[] = [
      { month: 3, t_mean: 1, t_min: -2, t_max: 4, precip: 40, soil_moist: 0.3, p_minus_et0: 10 },
      { month: 1, t_mean: null, t_min: null, t_max: null, precip: null, soil_moist: null, p_minus_et0: null },
    ];
    const r = climSeries(clim);
    expect(r.map((x) => x.month)).toEqual([1, 3]);
    expect(r[0]).toEqual({
      month: 1, label: "янв", t_mean: 0, t_min: 0, t_max: 0,
      precip: 0, soil_moist: 0, p_minus_et0: 0,
    });
    expect(r[1].label).toBe("мар");
  });
  it("does not mutate the input array order", () => {
    const clim: WeatherClimRow[] = [
      { month: 5, t_mean: 1, t_min: 0, t_max: 2, precip: 1, soil_moist: 0.1, p_minus_et0: 1 },
      { month: 2, t_mean: 1, t_min: 0, t_max: 2, precip: 1, soil_moist: 0.1, p_minus_et0: 1 },
    ];
    climSeries(clim);
    expect(clim.map((x) => x.month)).toEqual([5, 2]);
  });
});

describe("fullYears", () => {
  it("drops is_partial rows and sorts by year asc", () => {
    const year: WeatherYearRow[] = [
      yearRow({ year: 2026, is_partial: true }),
      yearRow({ year: 2025 }),
      yearRow({ year: 2018 }),
    ];
    expect(fullYears(year).map((x) => x.year)).toEqual([2018, 2025]);
  });
});

describe("ymMatrix", () => {
  it("zero-fills missing cells and has 12 cols per row", () => {
    const ym: WeatherYmRow[] = [
      { year: 2020, month: 1, t_mean: 3, precip_total: 50 },
      { year: 2020, month: 2, t_mean: null, precip_total: 60 },
      { year: 2019, month: 1, t_mean: -1, precip_total: 40 },
    ];
    const m = ymMatrix(ym, "t_mean");
    expect(m.rows).toEqual(["2019", "2020"]);
    expect(m.cols).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(m.values.length).toBe(2);
    expect(m.values[0].length).toBe(12);
    expect(m.values[0][0]).toBe(-1);
    expect(m.values[1][0]).toBe(3);
    expect(m.values[1][1]).toBe(0); // null -> 0
    expect(m.values[1][11]).toBe(0); // absent -> 0
  });
});

describe("gddSeries", () => {
  it("pivots long->wide with one column per year, missing -> 0", () => {
    const gdd: WeatherGddRow[] = [
      { year: 2020, month: 1, gdd5_cum: 0 },
      { year: 2020, month: 2, gdd5_cum: 5 },
      { year: 2021, month: 1, gdd5_cum: null },
    ];
    const s = gddSeries(gdd);
    expect(s.years).toEqual(["2020", "2021"]);
    expect(s.data.length).toBe(12);
    expect(s.data[0]).toMatchObject({ month: 1, label: "янв", "2020": 0, "2021": 0 });
    expect(s.data[1]).toMatchObject({ month: 2, "2020": 5, "2021": 0 });
    expect(s.data[5]["2020"]).toBe(0); // absent (year,month) -> 0
  });
});

describe("precipHistBars", () => {
  it("labels normal bins '0–2' and the top bin '30+', sorted asc", () => {
    const ph: WeatherPrecipHistRow[] = [
      { bin_lo: 30, days: 1 },
      { bin_lo: 0, days: 564 },
      { bin_lo: 4, days: 112 },
    ];
    const r = precipHistBars(ph);
    expect(r.map((x) => x.label)).toEqual(["0–2", "4–6", "30+"]);
    expect(r[0]).toEqual({ label: "0–2", days: 564 });
    expect(r[2]).toEqual({ label: "30+", days: 1 });
  });
});

describe("districtRankWeather", () => {
  it("sorts desc and drops null fields", () => {
    const d: WeatherDistrictRow[] = [
      { district_id: 1, district_name: "A район", warm_precip: 300, warm_soil_moist: 0.2, mushroom_days: 20 },
      { district_id: 2, district_name: "B район", warm_precip: 400, warm_soil_moist: 0.3, mushroom_days: 25 },
      { district_id: 3, district_name: "C район", warm_precip: null, warm_soil_moist: 0.1, mushroom_days: 10 },
    ];
    const r = districtRankWeather(d, "warm_precip");
    expect(r.map((x) => x.name)).toEqual(["B", "A"]);
    expect(r.map((x) => x.value)).toEqual([400, 300]);
  });
});

describe("districtMonthMatrix", () => {
  it("rows by district_id asc, 12 cols, zero-fill, name mapping", () => {
    const dm: WeatherDistrictMonthRow[] = [
      { district_id: 2, month: 1, soil_moist: 0.3, soil_temp: 1 },
      { district_id: 1, month: 1, soil_moist: 0.4, soil_temp: 2 },
      { district_id: 1, month: 2, soil_moist: null, soil_temp: 3 },
    ];
    const m = districtMonthMatrix(dm, "soil_moist", { "1": "Первый", "2": "Второй" });
    expect(m.rows).toEqual(["Первый", "Второй"]);
    expect(m.cols.length).toBe(12);
    expect(m.values.length).toBe(2);
    expect(m.values[0].length).toBe(12);
    expect(m.values[0][0]).toBe(0.4);
    expect(m.values[0][1]).toBe(0); // null -> 0
    expect(m.values[1][0]).toBe(0.3);
    expect(m.values[1][5]).toBe(0); // absent -> 0
  });
});

describe("shortDistrict", () => {
  it("strips trailing ' район'", () => {
    expect(shortDistrict("Всеволожский район")).toBe("Всеволожский");
  });
  it("special-cases Гатчинский муниципальный округ", () => {
    expect(shortDistrict("Гатчинский муниципальный округ")).toBe("Гатчинский");
  });
  it("special-cases Сосновоборский городской округ", () => {
    expect(shortDistrict("Сосновоборский городской округ")).toBe("Сосновоборск");
  });
});

describe("frostWindowItems", () => {
  it("drops null DOYs, maps start/end/mark, uses fullYears gate", () => {
    const year: WeatherYearRow[] = [
      yearRow({ year: 2026, is_partial: true, last_spring_frost_doy: 100, first_autumn_frost_doy: 280 }),
      yearRow({ year: 2020, last_spring_frost_doy: 114, first_autumn_frost_doy: 298 }),
      yearRow({ year: 2019, last_spring_frost_doy: null, first_autumn_frost_doy: 300 }),
    ];
    const r = frostWindowItems(year);
    expect(r).toEqual([
      { label: "2020", start: 114, end: 298, mark: 114 },
    ]);
  });
});
