import type maplibregl from "maplibre-gl";
import type { Map } from "maplibre-gl";
import { API_ORIGIN } from "../utils/api";
import { findFirstSymbolLayerId } from "../utils/findSymbolLayer";

export const SOIL_PMTILES_URL = `pmtiles://${API_ORIGIN}/tiles/soil.pmtiles`;

// 4 zone'ы реально присутствующих в ЛО (из 27 в национальной классификации):
//   - Почвы тайги... (~65%) — дерново-подзолистые, основной фон
//   - Гидроморфные (~23%) — болотные/глеевые
//   - Пойменные (~3%) — аллювиальные у рек, плодородные
//   - Непочвенные (~9%) — каменистые россыпи, водные тела
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
        "fill-color": [
          "match", ["get", "zone"],
          "Почвы тайги и хвойно-широколиственных лесов", "#c9a96e",
          "Гидроморфные почвы",                          "#5d6f8a",
          "Пойменные и маршевые почвы",                  "#7cb342",
          "Непочвенные образования",                     "#9e9e9e",
          "#bdbdbd",
        ],
        "fill-opacity": 0.45,
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
