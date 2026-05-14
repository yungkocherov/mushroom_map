/**
 * findFirstSymbolLayerId — utility для вставки fill-слоёв ПОД symbol-labels.
 *
 * Контракт: возвращает id первого слоя type='symbol' (или undefined если
 * symbol-слоёв нет). Используется в forest/water/oopt/etc. — fill-слой
 * добавляется через `m.addLayer(spec, beforeId)` чтобы подписи городов
 * остались поверх раскраски.
 */
import { describe, it, expect } from "vitest";
import type { Map } from "maplibre-gl";

import { findFirstSymbolLayerId } from "./findSymbolLayer";

/** Минимальный мок MapLibre Map: только getStyle() с layers. */
function mockMap(layers: Array<{ id: string; type: string }>): Map {
  return {
    getStyle: () => ({ layers }),
  } as unknown as Map;
}

describe("findFirstSymbolLayerId", () => {
  it("returns id of first symbol layer", () => {
    const m = mockMap([
      { id: "background",  type: "background" },
      { id: "land-fill",   type: "fill" },
      { id: "place-label", type: "symbol" },
      { id: "road-label",  type: "symbol" },
    ]);
    expect(findFirstSymbolLayerId(m)).toBe("place-label");
  });

  it("returns undefined when no symbol layers", () => {
    const m = mockMap([
      { id: "background",  type: "background" },
      { id: "fill-1",      type: "fill" },
      { id: "line-1",      type: "line" },
    ]);
    expect(findFirstSymbolLayerId(m)).toBeUndefined();
  });

  it("returns undefined on empty layers", () => {
    expect(findFirstSymbolLayerId(mockMap([]))).toBeUndefined();
  });

  it("returns undefined when style.layers missing entirely", () => {
    const m = { getStyle: () => ({}) } as unknown as Map;
    expect(findFirstSymbolLayerId(m)).toBeUndefined();
  });

  it("respects layer order — first wins", () => {
    const m = mockMap([
      { id: "label-place-capital",  type: "symbol" },
      { id: "label-place-village",  type: "symbol" },
    ]);
    expect(findFirstSymbolLayerId(m)).toBe("label-place-capital");
  });
});
