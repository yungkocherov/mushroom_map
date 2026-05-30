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
    minzoom: 6,
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
      // На z=6..9 показываем только реки и каналы (stream/ditch коллапсируются
      // в визуальный шум на низких зумах); с z=10 поднимаем и тонкие водотоки.
      // line-width:0 фактически прячет фичу.
      "line-width": [
        "interpolate", ["linear"], ["zoom"],
        6,  ["match", ["get", "waterway"], "river", 1.8, "canal", 1.2, 0],
        9,  ["match", ["get", "waterway"], "river", 2.4, "canal", 1.8, 0.5],
        11, ["match", ["get", "waterway"], "river", 3.0, "canal", 2.4, "stream", 1.2, 0.8],
        13, ["match", ["get", "waterway"], "river", 4.0, "canal", 3.2, "stream", 2.0, 1.2],
      ],
      "line-opacity": 0.85,
    } as unknown as maplibregl.LineLayerSpecification["paint"],
  });
}

export function setWaterwayVisibility(m: Map, visible: boolean): void {
  if (m.getLayer("waterway-line"))
    m.setLayoutProperty("waterway-line", "visibility", visible ? "visible" : "none");
}
