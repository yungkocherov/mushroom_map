import { describe, it, expect, beforeEach } from "vitest";
import { useLayerVisibility } from "./useLayerVisibility";

// Zustand store is a singleton in tests; reset to defaults between cases.
const initial = useLayerVisibility.getState();

beforeEach(() => {
  useLayerVisibility.setState(initial, true);
});

describe("useLayerVisibility — toggle/set", () => {
  it("setVisible mutates only the targeted key", () => {
    useLayerVisibility.getState().setVisible("forest", true);
    const s = useLayerVisibility.getState();
    expect(s.visible.forest).toBe(true);
    expect(s.visible.water).toBe(false);
    expect(s.visible.userSpots).toBe(true); // default kept
  });

  it("toggleVisible flips the targeted key", () => {
    useLayerVisibility.getState().toggleVisible("water");
    expect(useLayerVisibility.getState().visible.water).toBe(true);
    useLayerVisibility.getState().toggleVisible("water");
    expect(useLayerVisibility.getState().visible.water).toBe(false);
  });

  it("setLoaded is independent from visible", () => {
    useLayerVisibility.getState().setLoaded("forest", true);
    const s = useLayerVisibility.getState();
    expect(s.loaded.forest).toBe(true);
    expect(s.visible.forest).toBe(false);
  });
});

describe("useLayerVisibility — selectForestMode", () => {
  it("sets visible.forest=true AND switches mode in one action", () => {
    useLayerVisibility.getState().selectForestMode("bonitet");
    const s = useLayerVisibility.getState();
    expect(s.visible.forest).toBe(true);
    expect(s.forestColorMode).toBe("bonitet");
  });

  it("preserves other layers untouched", () => {
    useLayerVisibility.getState().setVisible("water", true);
    useLayerVisibility.getState().selectForestMode("age_group");
    expect(useLayerVisibility.getState().visible.water).toBe(true);
  });
});

describe("useLayerVisibility — resetAllVisibility", () => {
  it("flips all visible keys to false (including userSpots)", () => {
    useLayerVisibility.getState().setVisible("forest", true);
    useLayerVisibility.getState().setVisible("water", true);
    useLayerVisibility.getState().resetAllVisibility();
    const s = useLayerVisibility.getState();
    expect(Object.values(s.visible).every((v) => v === false)).toBe(true);
  });

  it("does NOT touch loaded — слои уже в карте, не сбрасываем", () => {
    useLayerVisibility.getState().setLoaded("forest", true);
    useLayerVisibility.getState().resetAllVisibility();
    expect(useLayerVisibility.getState().loaded.forest).toBe(true);
  });
});

describe("useLayerVisibility — speciesFilter normalization", () => {
  it("empty array → null (filter cleared)", () => {
    useLayerVisibility.getState().setSpeciesFilter([], "anything");
    expect(useLayerVisibility.getState().speciesFilter).toBeNull();
  });

  it("non-empty array kept as-is, label propagated", () => {
    useLayerVisibility
      .getState()
      .setSpeciesFilter(["boletus-edulis", "leccinum-scabrum"], "Боровик/подберёзовик");
    const s = useLayerVisibility.getState();
    expect(s.speciesFilter).toEqual(["boletus-edulis", "leccinum-scabrum"]);
    expect(s.speciesFilterLabel).toBe("Боровик/подберёзовик");
  });

  it("null clears both slug list and label", () => {
    useLayerVisibility.getState().setSpeciesFilter(["boletus-edulis"], "Боровик");
    useLayerVisibility.getState().setSpeciesFilter(null, null);
    const s = useLayerVisibility.getState();
    expect(s.speciesFilter).toBeNull();
    expect(s.speciesFilterLabel).toBeNull();
  });
});
