import type maplibregl from "maplibre-gl";
import type { Map } from "maplibre-gl";
import { TILES_BASE } from "../utils/api";
import { getVersatilesFonts } from "../utils/fonts";

// GeoJSON с населёнными пунктами ЛО из OSM. Маленький файл (~300 KB),
// загружается один раз. Нужен потому что Versatiles тайлы не содержат
// place=village/hamlet ниже zoom 12 — layer.minzoom не помогает,
// если в самих .pbf тайлах данных нет.
//
// Лежит рядом с pmtiles (тот же R2 bucket / VM mount), TILES_BASE его и
// найдёт. До 2026-04-28 хардкодилось `${API_ORIGIN}/tiles/...`, что в
// проде давало 404 — API не раздаёт static, тайлы живут на R2.
const PLACES_URL = `${TILES_BASE}/places.geojson`;

// Зум-фильтр: на далёком зуме видны только города/посёлки, деревни появляются
// по мере приближения. Без фильтра все 7k точек конкурируют за пространство и
// collision detection убирает большинство — а так управляем явно.
//
// step(zoom, default, break1, out1, break2, out2, ...)
//  zoom < 6  → city
//  zoom 6–7  → city, town
//  zoom 8–9  → + village, suburb, locality
//  zoom 10+  → все типы
export function addPlaceLabelsLayer(m: Map): void {
  if (m.getLayer("places-text")) return;
  if (!m.getSource("places")) {
    m.addSource("places", { type: "geojson", data: PLACES_URL });
  }
  m.addLayer({
    id: "places-text",
    type: "symbol",
    source: "places",
    minzoom: 4,
    // Зум-фильтр расширен после регрессии 2026-04: town виден с зума 5,
    // village/locality — с зума 7 (раньше village появлялась только с 8).
    // На «далёком» зуме (5–7) теперь видна вся середина иерархии — города,
    // посёлки городского типа, крупные сёла.
    filter: [
      "step", ["zoom"],
      ["in", ["get", "place"], ["literal", ["city"]]],
      5,  ["in", ["get", "place"], ["literal", ["city", "town"]]],
      7,  ["in", ["get", "place"], ["literal", ["city", "town", "village", "suburb", "locality"]]],
      10, true,
    ],
    layout: {
      "text-field": ["get", "name"],
      "text-size": [
        "interpolate", ["linear"], ["zoom"],
        4, ["match", ["get", "place"], ["city"], 12, ["town"], 11, 9],
        8, ["match", ["get", "place"], ["city"], 15, ["town"], 13, 11],
        12, ["match", ["get", "place"], ["city"], 17, ["town"], 15, 13],
      ],
      "text-font": getVersatilesFonts(),
      "text-anchor": "center",
      "text-max-width": 8,
      "text-allow-overlap": false,
      "text-padding": 2,
      "symbol-sort-key": ["get", "priority"],
    },
    paint: {
      "text-color": ["match", ["get", "place"], "city", "#111", "town", "#222", "#444"],
      "text-halo-color": "rgba(255,255,255,0.95)",
      "text-halo-width": 1.5,
    },
  } as unknown as maplibregl.SymbolLayerSpecification);
}
