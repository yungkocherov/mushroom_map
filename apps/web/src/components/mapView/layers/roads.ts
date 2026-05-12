import type maplibregl from "maplibre-gl";
import type { Map } from "maplibre-gl";
import { TILES_BASE } from "../utils/api";

export const ROADS_PMTILES_URL = `pmtiles://${TILES_BASE}/roads.pmtiles`;

// Сase + main-line: светлый halo снаружи делает коричневую линию видимой
// на зелёном лесе и серой подложке (иначе сливается).
export function addRoadsLayer(m: Map): void {
  if (m.getLayer("roads-line")) return;
  if (!m.getSource("roads")) {
    m.addSource("roads", { type: "vector", url: ROADS_PMTILES_URL });
  }
  m.addLayer({
    id: "roads-casing",
    type: "line",
    source: "roads",
    "source-layer": "roads",
    minzoom: 7,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#ffffff",
      // На z=7..9 тонкие казинги магистралей (видны и не превращаются в кашу),
      // потом плавно укрупняем как раньше.
      "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.8, 9, 1.6, 10, 2.2, 14, 5.5],
      "line-opacity": 0.85,
    } as unknown as maplibregl.LineLayerSpecification["paint"],
  });
  m.addLayer({
    id: "roads-line",
    type: "line",
    source: "roads",
    "source-layer": "roads",
    minzoom: 7,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#4a2c20",
      "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.4, 9, 0.7, 10, 1.0, 14, 2.6],
      "line-opacity": 0.95,
      "line-dasharray": [2, 1.5],
    } as unknown as maplibregl.LineLayerSpecification["paint"],
  });
}

export function setRoadsVisibility(m: Map, visible: boolean): void {
  const v = visible ? "visible" : "none";
  if (m.getLayer("roads-casing")) m.setLayoutProperty("roads-casing", "visibility", v);
  if (m.getLayer("roads-line"))   m.setLayoutProperty("roads-line",   "visibility", v);
}
