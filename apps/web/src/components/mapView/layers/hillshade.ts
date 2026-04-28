import type { Map } from "maplibre-gl";
import { TILES_BASE } from "../utils/api";
import { findFirstSymbolLayerId } from "../utils/findSymbolLayer";

export const HILLSHADE_PMTILES_URL = `pmtiles://${TILES_BASE}/hillshade.pmtiles`;

// Hillshade из Copernicus GLO-30 DEM, UTM 36N -> Web Mercator, PNG тайлы.
// Слой наложен как raster с multiply-blending, чтобы рельеф проступал
// сквозь forest/water/базовую карту, не забивая их цвет.
export function addHillshadeLayer(m: Map): void {
  if (m.getLayer("hillshade-raster")) return;
  if (!m.getSource("hillshade")) {
    m.addSource("hillshade", {
      type: "raster",
      url: HILLSHADE_PMTILES_URL,
      tileSize: 256,
      minzoom: 6,
      maxzoom: 11,
    });
  }
  // Вставляем над базовой картой, но под forest/water/oopt —
  // рельеф должен быть фоном, а не перекрывать тематические данные.
  // Раньше использовали beforeId=findFirstSymbolLayerId, но при текущем
  // порядке добавления (forest до hillshade) это клало рельеф ПОВЕРХ леса.
  // Теперь явно ищем самый «нижний» из тематических слоёв и встаём перед ним.
  const thematicBefore = ["forest-fill", "water-fill", "oopt-fill", "wetland-fill",
    "felling-fill", "protective-fill", "soil-fill", "waterway-line"]
    .find((id) => m.getLayer(id));
  const beforeId = thematicBefore ?? findFirstSymbolLayerId(m);
  // RGBA PNG с dodge-and-burn: альфа уже несёт информацию о крутизне.
  // Поэтому opacity держим высоко — само PNG уже «знает», где не рисовать.
  m.addLayer({
    id: "hillshade-raster",
    type: "raster",
    source: "hillshade",
    minzoom: 6,
    maxzoom: 14,
    paint: {
      "raster-opacity": 0.85,
      "raster-resampling": "linear",
      "raster-fade-duration": 150,
    },
  }, beforeId);
}

export function setHillshadeVisibility(m: Map, visible: boolean): void {
  if (m.getLayer("hillshade-raster"))
    m.setLayoutProperty("hillshade-raster", "visibility", visible ? "visible" : "none");
}
