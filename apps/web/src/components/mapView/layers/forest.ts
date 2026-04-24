import maplibregl, { type Map } from "maplibre-gl";
import {
  FOREST_LAYER_PAINT_COLOR,
} from "../../../lib/forestStyle";
import { API_ORIGIN } from "../utils/api";
import { findFirstSymbolLayerId } from "../utils/findSymbolLayer";

export const FOREST_PMTILES_URL = `pmtiles://${API_ORIGIN}/tiles/forest.pmtiles`;

export function addForestLayer(m: Map): void {
  if (m.getLayer("forest-fill")) return;
  try {
    if (!m.getSource("forest")) {
      m.addSource("forest", { type: "vector", url: FOREST_PMTILES_URL });
    }
    const beforeId = findFirstSymbolLayerId(m);
    m.addLayer(
      {
        id: "forest-fill",
        type: "fill",
        source: "forest",
        "source-layer": "forest",
        paint: FOREST_LAYER_PAINT_COLOR as unknown as maplibregl.FillLayerSpecification["paint"],
      },
      beforeId,
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[forest] addLayer failed:", e);
  }
}

export function setForestVisibility(m: Map, visible: boolean): void {
  if (m.getLayer("forest-fill"))
    m.setLayoutProperty("forest-fill", "visibility", visible ? "visible" : "none");
}
