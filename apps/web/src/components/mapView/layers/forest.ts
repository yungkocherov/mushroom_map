import maplibregl, { type Map } from "maplibre-gl";
import {
  FOREST_LAYER_PAINT_COLOR,
} from "../../../lib/forestStyle";
import { TILES_BASE } from "../utils/api";
import { findFirstSymbolLayerId } from "../utils/findSymbolLayer";

export const FOREST_PMTILES_URL = `pmtiles://${TILES_BASE}/forest.pmtiles`;

/**
 * forest.pmtiles покрывает z=5..13. Сборка через `build_forest_tiles.sh`
 * (tippecanoe + pmtiles convert): один source-layer 'forest' с полным
 * набором properties (dominant_species + bonitet + age_group + area_m2)
 * на всех зумах. tippecanoe coalesce-densest-as-needed сам решает
 * сколько polygon'ов поместить в каждый тайл. Один source + один layer
 * на фронте.
 */
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
  const visibility = visible ? "visible" : "none";
  if (m.getLayer("forest-fill")) m.setLayoutProperty("forest-fill", "visibility", visibility);
}
