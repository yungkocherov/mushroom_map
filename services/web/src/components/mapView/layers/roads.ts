import type maplibregl from "maplibre-gl";
import type { Map } from "maplibre-gl";
import { API_ORIGIN } from "../utils/api";

export const ROADS_PMTILES_URL = `pmtiles://${API_ORIGIN}/tiles/roads.pmtiles`;

export function addRoadsLayer(m: Map): void {
  if (m.getLayer("roads-line")) return;
  if (!m.getSource("roads")) {
    m.addSource("roads", { type: "vector", url: ROADS_PMTILES_URL });
  }
  m.addLayer({
    id: "roads-line",
    type: "line",
    source: "roads",
    "source-layer": "roads",
    minzoom: 10,
    paint: {
      "line-color": "#5d4037",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 14, 2],
      "line-opacity": 0.7,
      "line-dasharray": [3, 2],
    } as unknown as maplibregl.LineLayerSpecification["paint"],
  });
}

export function setRoadsVisibility(m: Map, visible: boolean): void {
  if (m.getLayer("roads-line"))
    m.setLayoutProperty("roads-line", "visibility", visible ? "visible" : "none");
}
