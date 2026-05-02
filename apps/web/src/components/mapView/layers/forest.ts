import maplibregl, { type Map } from "maplibre-gl";
import {
  FOREST_LAYER_PAINT_COLOR,
} from "../../../lib/forestStyle";
import { TILES_BASE } from "../utils/api";
import { findFirstSymbolLayerId } from "../utils/findSymbolLayer";

export const FOREST_PMTILES_URL = `pmtiles://${TILES_BASE}/forest.pmtiles`;
export const FOREST_LO_PMTILES_URL = `pmtiles://${TILES_BASE}/forest_lo.pmtiles`;

/**
 * Forest состоит из ДВУХ pmtiles-источников и ДВУХ layer'ов:
 *
 *   forest-lo (z=5..8):  forest_lo.pmtiles, ~30MB, same-species union'ы
 *                        внутри породы → крупные блобы. Цвета те же что
 *                        и full forest. Грузится в 10-30× быстрее на
 *                        обзорных зумах.
 *   forest    (z=8..13): forest.pmtiles, 737MB. Реальные вы́делы
 *                        Рослесхоза, каждый со своими границами +
 *                        properties.
 *
 * На z=8 рендерятся ОБА слоя (overlap). forest добавлен после, поэтому
 * рисуется поверх — visually forest dominate'ит. Пока forest тайлы
 * качаются на z=7→8 transition, forest-lo даёт continuous fallback
 * (без «дырки» в данных).
 *
 * setForestVisibility переключает оба layer'а синхронно.
 */
export function addForestLayer(m: Map): void {
  if (m.getLayer("forest-fill")) return;
  try {
    if (!m.getSource("forest")) {
      m.addSource("forest", { type: "vector", url: FOREST_PMTILES_URL });
    }
    if (!m.getSource("forest_lo")) {
      m.addSource("forest_lo", { type: "vector", url: FOREST_LO_PMTILES_URL });
    }
    const beforeId = findFirstSymbolLayerId(m);
    m.addLayer(
      {
        id: "forest-lo-fill",
        type: "fill",
        source: "forest_lo",
        "source-layer": "forest_lo",
        // Без maxzoom — MapLibre overzoom'ит z=8 тайлы forest_lo для
        // z=9+, обеспечивая continuous bridge под детальный forest.
        // Opacity ramp: 0.5 на z<=8 (forest_lo primary, forest минзум 8
        // только-только начинает рисоваться); fade до 0.15 к z=10+
        // (forest detail dominate'ит, forest_lo только закрывает gap'ы
        // во время load'а forest тайлов на zoom transition'ах).
        paint: {
          ...FOREST_LAYER_PAINT_COLOR,
          "fill-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5, 0.5,
            8, 0.5,
            10, 0.15,
          ],
        } as unknown as maplibregl.FillLayerSpecification["paint"],
      },
      beforeId,
    );
    m.addLayer(
      {
        id: "forest-fill",
        type: "fill",
        source: "forest",
        "source-layer": "forest",
        minzoom: 8,
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
  if (m.getLayer("forest-lo-fill")) m.setLayoutProperty("forest-lo-fill", "visibility", visibility);
}
