import type maplibregl from "maplibre-gl";
import { setVersatilesFonts } from "../utils/fonts";

// Правильный путь — через /assets/styles/colorful/style.json (не просто
// colorful.json — тот отдаёт 404).
const SCHEME_STYLE_URL = "https://tiles.versatiles.org/assets/styles/colorful/style.json";

// Масштаб текста по типу слоя. ВАЖНО: мелкие населённые пункты НЕ увеличиваем —
// чем крупнее текст деревни, тем меньше деревень MapLibre показывает (collision
// detection). Оригинальный размер ~10-12px оптимален для сотен деревень
// одновременно. Дороги и POI можно укрупнить — их меньше.
const ROAD_POI_LABEL_SCALE = 1.5;
const LARGE_PLACE_SCALE    = 1.3;
const SMALL_PLACE_SCALE    = 1.0;

const SMALL_PLACE_RE = /^label-place-(village|hamlet|suburb|quarter|neighbourhood|locality|farm|isolated_dwelling)$/;
const LARGE_PLACE_RE = /^label-place-(city|town|capital|statecapital)$/;

// minzoom явные overrides. Для незнакомых label-place-* — catchall (-5 от дефолта).
const LABEL_MINZOOM_OVERRIDES: Record<string, number> = {
  "label-place-capital":            3,
  "label-place-statecapital":       4,
  "label-place-city":               5,
  "label-place-town":               6,
  "label-place-village":            6,   // главное — деревни с zoom 6
  "label-place-hamlet":             7,
  "label-place-suburb":             7,
  "label-place-quarter":            9,
  "label-place-neighbourhood":     10,
  "label-place-locality":           7,
  "label-place-isolated_dwelling":  8,
  "label-place-farm":               7,
};

// Фетчит Versatiles Colorful, патчит под MapLibre 4.5 и увеличивает подписи.
//
// 1. sprite приходит массивом `[{id, url}]` (MapLibre 5.x multi-sprite format) —
//    для 4.x нужна строка, берём первый url.
// 2. text-size в большинстве symbol-слоёв — legacy-формат `{stops: [[z, v], ...]}`,
//    который нельзя обернуть в ["*", k, expr]. Мутируем stops напрямую.
// 3. minzoom для label-place-* уменьшаем согласно LABEL_MINZOOM_OVERRIDES.
export async function buildSchemeStyle(): Promise<maplibregl.StyleSpecification> {
  const resp = await fetch(SCHEME_STYLE_URL);
  if (!resp.ok) throw new Error(`versatiles ${resp.status}`);
  const style = await resp.json() as {
    sprite?: string | Array<{ id: string; url: string }>;
    sources: Record<string, unknown>;
    layers: Array<{
      id?: string;
      type: string;
      minzoom?: number;
      layout?: Record<string, unknown>;
      [k: string]: unknown;
    }>;
    [k: string]: unknown;
  };

  if (Array.isArray(style.sprite) && style.sprite.length > 0) {
    style.sprite = style.sprite[0].url;
  }

  for (const layer of style.layers) {
    if (layer.type === "symbol" && layer.layout?.["text-font"]) {
      const fonts = layer.layout["text-font"];
      if (Array.isArray(fonts) && fonts.length > 0 && typeof fonts[0] === "string") {
        setVersatilesFonts(fonts as string[]);
        break;
      }
    }
  }

  for (const layer of style.layers) {
    if (layer.type !== "symbol") continue;
    const layerId = layer.id ?? "";

    const scale = SMALL_PLACE_RE.test(layerId) ? SMALL_PLACE_SCALE
                : LARGE_PLACE_RE.test(layerId) ? LARGE_PLACE_SCALE
                : ROAD_POI_LABEL_SCALE;

    if (scale !== 1.0 && layer.layout) {
      const ts = layer.layout["text-size"];
      if (ts != null) {
        if (typeof ts === "number") {
          layer.layout["text-size"] = ts * scale;
        } else if (typeof ts === "object" && !Array.isArray(ts) && Array.isArray((ts as { stops?: unknown }).stops)) {
          const stops = (ts as { stops: Array<[number, number]> }).stops;
          layer.layout["text-size"] = {
            ...(ts as object),
            stops: stops.map(([z, v]) => [z, v * scale] as [number, number]),
          };
        } else if (Array.isArray(ts)) {
          layer.layout["text-size"] = ["*", scale, ts];
        }
      }
    }

    if (layerId.startsWith("label-place-")) {
      if (layerId in LABEL_MINZOOM_OVERRIDES) {
        layer.minzoom = LABEL_MINZOOM_OVERRIDES[layerId];
      } else {
        layer.minzoom = Math.max(0, (layer.minzoom ?? 12) - 5);
      }
    }
  }

  return style as unknown as maplibregl.StyleSpecification;
}

export const SCHEME_STYLE_FALLBACK: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    esri_topo: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© Esri, USGS, NOAA",
    },
  },
  layers: [{ id: "esri_topo", type: "raster", source: "esri_topo" }],
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
};
