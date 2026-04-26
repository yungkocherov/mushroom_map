import type maplibregl from "maplibre-gl";
import type { Map } from "maplibre-gl";
import { TILES_BASE } from "../utils/api";
import { findFirstSymbolLayerId } from "../utils/findSymbolLayer";

export const OOPT_PMTILES_URL = `pmtiles://${TILES_BASE}/oopt.pmtiles`;

export function addOoptLayer(m: Map): void {
  if (m.getLayer("oopt-fill")) return;
  if (!m.getSource("oopt")) {
    m.addSource("oopt", { type: "vector", url: OOPT_PMTILES_URL });
  }
  const beforeId = findFirstSymbolLayerId(m);
  m.addLayer(
    {
      id: "oopt-fill",
      type: "fill",
      source: "oopt",
      "source-layer": "oopt",
      paint: {
        "fill-color": [
          "match", ["get", "oopt_category"],
          "zapovednik",    "#b71c1c",
          "nat_park",      "#e65100",
          "prirodny_park", "#f57f17",
          "zakaznik",      "#558b2f",
          "pamyatnik",     "#6a1b9a",
          "#455a64",
        ],
        "fill-opacity": 0.25,
        "fill-antialias": false,
      } as unknown as maplibregl.FillLayerSpecification["paint"],
    },
    beforeId,
  );
}

export function setOoptVisibility(m: Map, visible: boolean): void {
  if (m.getLayer("oopt-fill"))
    m.setLayoutProperty("oopt-fill", "visibility", visible ? "visible" : "none");
}
