import type maplibregl from "maplibre-gl";
import type { Map } from "maplibre-gl";
import { TILES_BASE } from "../utils/api";
import { findFirstSymbolLayerId } from "../utils/findSymbolLayer";

export const WATER_PMTILES_URL = `pmtiles://${TILES_BASE}/water.pmtiles`;

export function addWaterLayer(m: Map): void {
  if (m.getLayer("water-fill")) return;
  if (!m.getSource("water")) {
    m.addSource("water", { type: "vector", url: WATER_PMTILES_URL });
  }
  const beforeId = findFirstSymbolLayerId(m);
  m.addLayer(
    {
      id: "water-fill",
      type: "fill",
      source: "water",
      "source-layer": "water",
      paint: {
        "fill-color": "#1565C0",
        "fill-opacity": 0.3,
        "fill-antialias": false,
      } as unknown as maplibregl.FillLayerSpecification["paint"],
    },
    beforeId,
  );
}

export function setWaterVisibility(m: Map, visible: boolean): void {
  if (m.getLayer("water-fill"))
    m.setLayoutProperty("water-fill", "visibility", visible ? "visible" : "none");
}
