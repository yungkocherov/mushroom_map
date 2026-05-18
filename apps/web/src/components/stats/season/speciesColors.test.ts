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
