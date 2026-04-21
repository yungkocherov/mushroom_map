import type maplibregl from "maplibre-gl";
import type { Map } from "maplibre-gl";
import { API_ORIGIN } from "../utils/api";
import { findFirstSymbolLayerId } from "../utils/findSymbolLayer";

// Районы ЛО — 18 полигонов из admin_area (level=6). Файл ~0.7 МБ, лёгкий;
// используем GeoJSON source вместо PMTiles. Рендерим только границу линией —
// fill'ом не закрываем лес и другие слои под ним.
//
// Это основа для forecast-оверлея: прогноз модели будет choropleth-заливкой
// тех же полигонов, грузится отдельным слоем (districts-forecast-fill).
export const DISTRICTS_URL = `${API_ORIGIN}/api/districts/?region=lenoblast`;

export function addDistrictsLayer(m: Map): void {
  if (m.getLayer("districts-line")) return;
  if (!m.getSource("districts")) {
    m.addSource("districts", {
      type: "geojson",
      data: DISTRICTS_URL,
      generateId: false,
    });
  }
  const beforeId = findFirstSymbolLayerId(m);
  m.addLayer(
    {
      id: "districts-line",
      type: "line",
      source: "districts",
      paint: {
        "line-color": "#4a148c",
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          6, 0.8,
          9, 1.2,
          12, 2.0,
        ],
        "line-opacity": 0.7,
        "line-dasharray": [3, 2],
      } as unknown as maplibregl.LineLayerSpecification["paint"],
    },
    beforeId,
  );
}

export function setDistrictsVisibility(m: Map, visible: boolean): void {
  if (m.getLayer("districts-line"))
    m.setLayoutProperty("districts-line", "visibility", visible ? "visible" : "none");
}
