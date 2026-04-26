import type maplibregl from "maplibre-gl";
import type { Map } from "maplibre-gl";
import { TILES_BASE } from "../utils/api";
import { findFirstSymbolLayerId } from "../utils/findSymbolLayer";

export const PROTECTIVE_PMTILES_URL = `pmtiles://${TILES_BASE}/protective.pmtiles`;

export function addProtectiveLayer(m: Map): void {
  if (m.getLayer("protective-fill")) return;
  if (!m.getSource("protective")) {
    m.addSource("protective", { type: "vector", url: PROTECTIVE_PMTILES_URL });
  }
  const beforeId = findFirstSymbolLayerId(m);
  m.addLayer(
    {
      id: "protective-fill",
      type: "fill",
      source: "protective",
      "source-layer": "protective",
      paint: {
        "fill-color": "#6a1b9a",
        "fill-opacity": 0.25,
        "fill-antialias": false,
      } as unknown as maplibregl.FillLayerSpecification["paint"],
    },
    beforeId,
  );
}

export function setProtectiveVisibility(m: Map, visible: boolean): void {
  if (m.getLayer("protective-fill"))
    m.setLayoutProperty("protective-fill", "visibility", visible ? "visible" : "none");
}
