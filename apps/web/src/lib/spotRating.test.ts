/**
 * Tests for spotRating constants — single source of truth для шкалы
 * качества user_spot (1..5). Шкала должна совпадать с:
 *   - CHECK constraint в db/migrations/030_user_spot_rating.sql (1..5)
 *   - Pydantic Field(ge=1, le=5) в services/api/src/api/routes/cabinet.py
 *   - SpotRating type в packages/types
 */
import { describe, it, expect } from "vitest";
import { RATING_OPTIONS, RATING_HEX, RATING_LABEL } from "./spotRating";

describe("spotRating — constants integrity", () => {
  it("has exactly 5 rating options", () => {
    expect(RATING_OPTIONS).toHaveLength(5);
  });

  it("values are 1..5 in order", () => {
    expect(RATING_OPTIONS.map((o) => o.value)).toEqual([1, 2, 3, 4, 5]);
  });

  it("every option has label and hex", () => {
    for (const o of RATING_OPTIONS) {
      expect(o.label).toBeTruthy();
      expect(o.hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("RATING_HEX exposes lookup для каждого значения 1..5", () => {
    for (let i = 1 as 1; i <= 5; i++) {
      expect(RATING_HEX[i as 1 | 2 | 3 | 4 | 5]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("RATING_LABEL exposes русскую метку для каждого значения", () => {
    for (let i = 1 as 1; i <= 5; i++) {
      expect(RATING_LABEL[i as 1 | 2 | 3 | 4 | 5]).toBeTruthy();
    }
  });

  it("RATING_HEX and RATING_LABEL keys соответствуют RATING_OPTIONS", () => {
    expect(Object.keys(RATING_HEX).sort()).toEqual(["1", "2", "3", "4", "5"]);
    expect(Object.keys(RATING_LABEL).sort()).toEqual(["1", "2", "3", "4", "5"]);
  });

  // Семантика градиента: 1=красный, 5=зелёный — нельзя случайно перепутать
  // и сделать 5=красный, иначе user_spot маркеры на /map будут лгать.
  it("rating 1 is reddish (bad), rating 5 is greenish (good)", () => {
    // hex: 0xRRGGBB — для красного R > G, для зелёного G > R
    const parse = (h: string) => ({
      r: parseInt(h.slice(1, 3), 16),
      g: parseInt(h.slice(3, 5), 16),
      b: parseInt(h.slice(5, 7), 16),
    });
    const r1 = parse(RATING_HEX[1]);
    const r5 = parse(RATING_HEX[5]);
    expect(r1.r).toBeGreaterThan(r1.g);
    expect(r5.g).toBeGreaterThan(r5.r);
  });
});
