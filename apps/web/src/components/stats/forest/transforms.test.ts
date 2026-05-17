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
    expect(meanStandSize(dim)[0].ha).toBeCloseTo(2.0, 6);
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
  it("orders 1..5 then н/д", () => {
    const dim: ForestDimRow[] = [
      { dimension: "bonitet", key: "3", label: "3", area_km2: 30, polygon_count: 3 },
      { dimension: "bonitet", key: "1", label: "1", area_km2: 10, polygon_count: 1 },
      { dimension: "bonitet", key: "unknown", label: "unknown", area_km2: 1, polygon_count: 1 },
    ];
    expect(bonitetRanking(dim).map(x => x.key)).toEqual(["1", "3", "н/д"]);
  });
});

describe("histBars", () => {
  it("formats bin label and keeps area", () => {
    const h: ForestHistRow[] = [
      { metric: "stock", bin_lo: 0, bin_hi: 20, area_km2: 5, polygon_count: 2 },
      { metric: "stock", bin_lo: 20, bin_hi: 40, area_km2: 9, polygon_count: 3 },
    ];
    expect(histBars(h, "stock")).toEqual([
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
    expect(ageStructure(dim).map(x => x.key)).toEqual(["молодняки", "спелые"]);
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
    expect(districtRanking(d, "mean_bonitet").map(x => x.name)).toEqual(["B", "A"]);
  });
});
