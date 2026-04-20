import type maplibregl from "maplibre-gl";
import type { Map } from "maplibre-gl";
import { API_ORIGIN } from "../utils/api";
import { findFirstSymbolLayerId } from "../utils/findSymbolLayer";

export const FELLING_PMTILES_URL = `pmtiles://${API_ORIGIN}/tiles/felling.pmtiles`;

export function addFellingLayer(m: Map): void {
  if (m.getLayer("felling-fill")) return;
  if (!m.getSource("felling")) {
    m.addSource("felling", { type: "vector", url: FELLING_PMTILES_URL });
  }
  const beforeId = findFirstSymbolLayerId(m);
  m.addLayer(
    {
      id: "felling-fill",
      type: "fill",
      source: "felling",
      "source-layer": "felling",
      paint: {
        "fill-color": [
          "match", ["get", "area_type"],
          "Вырубка", "#ff5722",
          "Гарь", "#b71c1c",
          "Погибшее насаждение", "#5d4037",
          "#bf360c",
        ],
        "fill-opacity": 0.5,
        "fill-antialias": false,
      } as unknown as maplibregl.FillLayerSpecification["paint"],
    },
    beforeId,
  );
}

export function setFellingVisibility(m: Map, visible: boolean): void {
  if (m.getLayer("felling-fill"))
    m.setLayoutProperty("felling-fill", "visibility", visible ? "visible" : "none");
}
