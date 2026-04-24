import type maplibregl from "maplibre-gl";
import { buildSchemeStyle } from "./scheme";

// Гибрид = Versatiles Colorful + ESRI satellite как нижний raster.
// Сохраняем только line- и symbol-слои (дороги, подписи); все fill-слои из
// Versatiles (land cover, water, building) убираем — они закрыли бы спутник.
export async function buildHybridStyle(): Promise<maplibregl.StyleSpecification> {
  const style = await buildSchemeStyle();
  (style.sources as Record<string, unknown>)["esri-satellite"] = {
    type: "raster",
    tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
    tileSize: 256,
    maxzoom: 19,
    attribution: "Imagery © Esri, Maxar",
  };
  const kept = style.layers.filter(l => l.type === "symbol" || l.type === "line");
  style.layers = [
    { id: "esri-satellite-layer", type: "raster", source: "esri-satellite" } as maplibregl.RasterLayerSpecification,
    ...kept,
  ];
  return style;
}

// Фоллбэк гибрида: ESRI спутник + ESRI Reference labels (без Versatiles).
export const HYBRID_STYLE_FALLBACK: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Imagery © Esri, Maxar",
    },
    labels: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 14,
      attribution: "Labels © Esri",
    },
  },
  layers: [
    { id: "satellite", type: "raster", source: "satellite" },
    { id: "labels", type: "raster", source: "labels" },
  ],
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
};
