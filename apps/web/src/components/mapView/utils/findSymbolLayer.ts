import type { Map } from "maplibre-gl";

// Ищет id самого нижнего symbol-слоя — чтобы вставить наш fill-слой ПОД ним.
// Так надписи городов / улиц / озёр остаются поверх лесной раскраски.
export function findFirstSymbolLayerId(m: Map): string | undefined {
  const layers = m.getStyle().layers ?? [];
  for (const l of layers) {
    if (l.type === "symbol") return l.id;
  }
  return undefined;
}
