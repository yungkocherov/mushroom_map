import maplibregl, { type Map } from "maplibre-gl";
import {
  FOREST_LAYER_PAINT_COLOR,
} from "../../../lib/forestStyle";
import { TILES_BASE } from "../utils/api";
import { findFirstSymbolLayerId } from "../utils/findSymbolLayer";

export const FOREST_PMTILES_URL = `pmtiles://${TILES_BASE}/forest.pmtiles`;

/**
 * forest.pmtiles покрывает z=5..13. На z<=8 build_tiles.py идёт coarse-путь
 * (per-species ST_Union по `forest_3857_low`) — цвета пород сохраняются,
 * bonitet/age_group теряются. На z>=9 — реальные выделы Рослесхоза с
 * полным набором properties. Один source + один layer на всех зумах.
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
