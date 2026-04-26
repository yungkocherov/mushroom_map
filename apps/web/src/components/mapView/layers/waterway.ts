import type maplibregl from "maplibre-gl";
import type { Map } from "maplibre-gl";
import { TILES_BASE } from "../utils/api";

export const WATERWAY_PMTILES_URL = `pmtiles://${TILES_BASE}/waterway.pmtiles`;

// Линейные водотоки из OSM. Реки и каналы шире, ручьи/канавы тоньше.
// Цвет — вода стандартный, но bluer чем water-fill (полигональные озёра),
// чтобы линейные ручьи визуально отличались от больших водоёмов.
export function addWaterwayLayer(m: Map): void {
  if (m.getLayer("waterway-line")) return;
  if (!m.getSource("waterway")) {
    m.addSource("waterway", { type: "vector", url: WATERWAY_PMTILES_URL });
  }
  m.addLayer({
    id: "waterway-line",
    type: "line",
    source: "waterway",
    "source-layer": "waterway",
    minzoom: 9,
    paint: {
      "line-color": [
        "match", ["get", "waterway"],
        "river", "#1976d2",
        "canal", "#1976d2",
        "stream", "#42a5f5",
        "drain", "#7e57c2",
        "ditch", "#7e57c2",
        "#42a5f5",
      ],
      "line-width": [
        "interpolate", ["linear"], ["zoom"],
        9,  ["match", ["get", "waterway"], "river", 2.0, "canal", 1.5, 0.6],
        13, ["match", ["get", "waterway"], "river", 5.0, "canal", 4.0, "stream", 2.5, 1.5],
      ],
      "line-opacity": 0.85,
    } as unknown as maplibregl.LineLayerSpecification["paint"],
  });
}

export function setWaterwayVisibility(m: Map, visible: boolean): void {
  if (m.getLayer("waterway-line"))
    m.setLayoutProperty("waterway-line", "visibility", visible ? "visible" : "none");
}
