import type maplibregl from "maplibre-gl";
import type { Map } from "maplibre-gl";
import { API_ORIGIN } from "../utils/api";
import { findFirstSymbolLayerId } from "../utils/findSymbolLayer";

export const WETLANDS_PMTILES_URL = `pmtiles://${API_ORIGIN}/tiles/wetlands.pmtiles`;

export function addWetlandLayer(m: Map): void {
  if (m.getLayer("wetland-fill")) return;
  if (!m.getSource("wetland")) {
    m.addSource("wetland", { type: "vector", url: WETLANDS_PMTILES_URL });
  }
  const beforeId = findFirstSymbolLayerId(m);
  m.addLayer(
    {
      id: "wetland-fill",
      type: "fill",
      source: "wetland",
      "source-layer": "wetland",
      paint: {
        // Тёмно-коричневый (цвет торфа), высокая прозрачность — болота видно,
        // но они не доминируют над основной раскраской.
        "fill-color": "#795548",
        "fill-opacity": 0.4,
        "fill-antialias": false,
      } as unknown as maplibregl.FillLayerSpecification["paint"],
    },
    beforeId,
  );
}

export function setWetlandVisibility(m: Map, visible: boolean): void {
  if (m.getLayer("wetland-fill"))
    m.setLayoutProperty("wetland-fill", "visibility", visible ? "visible" : "none");
}
