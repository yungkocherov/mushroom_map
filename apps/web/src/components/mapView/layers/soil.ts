import type maplibregl from "maplibre-gl";
import type { Map } from "maplibre-gl";
import { API_ORIGIN } from "../utils/api";
import { findFirstSymbolLayerId } from "../utils/findSymbolLayer";
import { buildSoilFillColorExpression } from "../../../lib/soilStyle";

export const SOIL_PMTILES_URL = `pmtiles://${API_ORIGIN}/tiles/soil.pmtiles`;

// Раскраска по soil0_id, сгруппированному в 8 грибно-значимых кластеров
// (см. lib/soilStyle.ts). Раньше окрашивали по `zone` (всего 4 категории)
// — из-за чего дерново-карбонатные и дерново-подзолистые выглядели одинаково.
export function addSoilLayer(m: Map): void {
  if (m.getLayer("soil-fill")) return;
  if (!m.getSource("soil")) {
    m.addSource("soil", { type: "vector", url: SOIL_PMTILES_URL });
  }
  const beforeId = findFirstSymbolLayerId(m);
  m.addLayer(
    {
      id: "soil-fill",
      type: "fill",
      source: "soil",
      "source-layer": "soil",
      paint: {
        "fill-color": buildSoilFillColorExpression() as unknown as maplibregl.ExpressionSpecification,
        "fill-opacity": 0.55,
        "fill-antialias": false,
      } as unknown as maplibregl.FillLayerSpecification["paint"],
    },
    beforeId,
  );
}

export function setSoilVisibility(m: Map, visible: boolean): void {
  if (m.getLayer("soil-fill"))
    m.setLayoutProperty("soil-fill", "visibility", visible ? "visible" : "none");
}
