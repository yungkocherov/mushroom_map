import { palette } from "@mushroom-map/tokens/native";

/**
 * Phase 2 map style. Multi-source: optional basemap-lo + один vector
 * source per downloaded region (forest-{slug}). Background paper
 * рисуется до basemap'а (если он есть) и forest layer'а.
 *
 * basemap собирается через `pipelines/build_basemap.py` (planetiler
 * с OpenMapTiles schema). Без basemap'а — paper-фон + forest как в
 * Phase 0/1.
 */

/**
 * Цвета синхронизированы с web FOREST_COLORS (apps/web/src/lib/forestStyle.ts).
 * Палитра «коры дерева» — pine коричневый, spruce почти-чёрный, birch
 * светло-кремовый, и т.д. Не зелёные тона — это намеренно: на спутник-
 * basemap'е зелёный сливается, кора лучше различима. Также matches
 * tinge web-versii.
 */
const SPECIES_COLOR_MATCH = [
  "match",
  ["coalesce", ["get", "dominant_species"], "mixed"],
  "pine", "#8b5a34",
  "spruce", "#3e2e1c",
  "larch", "#9a4626",
  "fir", "#56564e",
  "cedar", "#5c3a24",
  "birch", "#c8b890",
  "aspen", "#9ea48c",
  "alder", "#6c5844",
  "oak", "#5a3c20",
  "linden", "#a48c72",
  "maple", "#7e5638",
  "mixed_coniferous", "#463a22",
  "mixed_broadleaved", "#a0845a",
  "mixed", "#607244",
  /* default */ "#9e9e9e",
] as const;

type Style = {
  version: 8;
  sources: Record<string, unknown>;
  layers: unknown[];
  glyphs?: string;
};

export type ForestSource = {
  /** Stable id для MapLibre source ("forest-luzhsky", "forest-vyborgsky", ...). */
  id: string;
  /** Either bundled file:// URI или path в FileSystem.documentDirectory. */
  pmtilesFileUri: string;
  /** MVT source-layer name (default 'forest'). Lo-zoom форест использует 'forest_lo'. */
  sourceLayer?: string;
  /** Layer minzoom (default 8). undefined для lo-zoom (рисует с 0). */
  minzoom?: number;
  /** Layer maxzoom (default undefined = до z=24). 9 для lo-zoom (renders <9). */
  maxzoom?: number;
};

/**
 * Режим базовой подложки.
 *   - scheme: бумажный фон + bundled basemap-lo-low (offline-friendly).
 *   - satellite: ESRI World Imagery raster, без подписей; forest сверху
 *     с пониженной непрозрачностью. Требует интернет.
 *   - hybrid: ESRI satellite + наши symbol-слои (place/water_name) поверх,
 *     без landcover-fill. Требует интернет.
 */
export type BaseMapMode = "scheme" | "satellite" | "hybrid";

export type StyleInput = {
  forests: ForestSource[];
  /** OpenMapTiles-schema basemap (planetiler output). Optional. */
  basemapPmtilesUri?: string | null;
  /**
   * URL pattern для glyphs (`{fontstack}/{range}.pbf` substituted by
   * MapLibre). Если null — используется `BASEMAP_GLYPHS_URL_FALLBACK`
   * (online через api.geobiom.ru). Bundled-glyphs base URI поставляется
   * через `services/glyphs.ts: ensureGlyphsExtracted()`.
   */
  glyphsUrl?: string | null;
  /** Базовая подложка. По умолчанию `scheme`. */
  baseMap?: BaseMapMode;
};

/**
 * Fallback online URL для PBF-glyphs (если bundled-extract ещё не
 * прошёл или недоступен). С Phase 6 (2026-05-04) bundled-PBF в asset'ах,
 * online остаётся как кросс-проверка и для случая если copy в
 * documentDirectory упал.
 *
 * Без glyphs symbol-слои тихо не рендерятся (но карта работает).
 */
export const BASEMAP_GLYPHS_URL_FALLBACK =
  "https://api.geobiom.ru/glyphs/{fontstack}/{range}.pbf";

/**
 * Layers OpenMapTiles schema, которые мы рисуем (subset, optimized for
 * forest-day use case): water, waterway, transportation, boundary,
 * landcover, place (символьный — города/посёлки), water_name (озёра/
 * реки). Pruning'ом стараемся не перегружать карту: урбанистика /
 * housenumbers / poi скрыты (грибнику не нужны магазины и mailboxes).
 */
function buildBasemapLayers(): unknown[] {
  return [
    {
      id: "basemap-water",
      type: "fill",
      source: "basemap",
      "source-layer": "water",
      paint: {
        "fill-color": "#bcd1cc",
      },
    },
    {
      id: "basemap-landcover",
      type: "fill",
      source: "basemap",
      "source-layer": "landcover",
      filter: ["in", ["get", "class"], ["literal", ["wood", "forest", "scrub", "grass", "park"]]],
      paint: {
        "fill-color": "#dde6d2",
        "fill-opacity": 0.6,
      },
    },
    {
      id: "basemap-waterway",
      type: "line",
      source: "basemap",
      "source-layer": "waterway",
      minzoom: 9,
      paint: {
        "line-color": "#7a9bb0",
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.5, 14, 1.5],
      },
    },
    {
      id: "basemap-roads",
      type: "line",
      source: "basemap",
      "source-layer": "transportation",
      minzoom: 8,
      filter: [
        "in",
        ["get", "class"],
        ["literal", ["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service", "track"]],
      ],
      paint: {
        "line-color": [
          "match",
          ["get", "class"],
          "motorway", "#a86b0f",
          "trunk", "#a86b0f",
          "primary", "#c08020",
          "#7a7a70",
        ],
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          8, 0.4,
          12, 1.2,
          14, 2.4,
        ],
      },
    },
    {
      id: "basemap-boundary",
      type: "line",
      source: "basemap",
      "source-layer": "boundary",
      filter: ["<=", ["get", "admin_level"], 6],
      paint: {
        "line-color": "#aaa295",
        "line-width": 0.6,
        "line-dasharray": [3, 2],
      },
    },
    // Подписи населённых пунктов. OpenMapTiles schema → place. У OMT-данных
    // обычно `name:ru` для русских названий, fallback на `name`.
    {
      id: "basemap-place-city",
      type: "symbol",
      source: "basemap",
      "source-layer": "place",
      filter: ["in", ["get", "class"], ["literal", ["city", "town"]]],
      minzoom: 6,
      layout: {
        "text-field": ["coalesce", ["get", "name:ru"], ["get", "name"]],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 6, 11, 12, 16],
        "text-anchor": "center",
        "text-padding": 4,
      },
      paint: {
        "text-color": "#3a3a36",
        "text-halo-color": "#f5f1e6",
        "text-halo-width": 1.6,
      },
    },
    {
      id: "basemap-place-village",
      type: "symbol",
      source: "basemap",
      "source-layer": "place",
      filter: ["==", ["get", "class"], "village"],
      minzoom: 8,
      layout: {
        "text-field": ["coalesce", ["get", "name:ru"], ["get", "name"]],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 8, 10, 14, 14],
        "text-anchor": "center",
        "text-padding": 1,
        "symbol-sort-key": ["coalesce", ["get", "rank"], 99],
      },
      paint: {
        "text-color": "#3a3a36",
        "text-halo-color": "#f5f1e6",
        "text-halo-width": 1.6,
      },
    },
    {
      id: "basemap-place-hamlet",
      type: "symbol",
      source: "basemap",
      "source-layer": "place",
      filter: ["in", ["get", "class"], ["literal", ["hamlet", "suburb", "neighbourhood", "isolated_dwelling"]]],
      minzoom: 10,
      layout: {
        "text-field": ["coalesce", ["get", "name:ru"], ["get", "name"]],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 10, 9, 14, 12],
        "text-anchor": "center",
        "text-padding": 1,
      },
      paint: {
        "text-color": "#5a5a52",
        "text-halo-color": "#f5f1e6",
        "text-halo-width": 1.4,
      },
    },
    // Подписи водоёмов (озёра/реки) если в OMT-extract'е есть water_name.
    {
      id: "basemap-water-name",
      type: "symbol",
      source: "basemap",
      "source-layer": "water_name",
      minzoom: 8,
      layout: {
        "text-field": ["coalesce", ["get", "name:ru"], ["get", "name"]],
        "text-font": ["Noto Sans Italic"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 8, 10, 13, 12],
        "text-anchor": "center",
        "text-padding": 3,
      },
      paint: {
        "text-color": "#456b80",
        "text-halo-color": "#f5f1e6",
        "text-halo-width": 1.2,
      },
    },
  ];
}

/**
 * Нормализует path/URI к форме `file:///...` чтобы pmtiles handler в
 * MapLibre Native смог открыть файл. expo-asset.localUri / FileSystem.*
 * на Android могут возвращать одну из:
 *   - "file:///data/...": готово
 *   - "/data/...": absolute path → префиксуем `file://`
 *   - "asset:///...": не работает с pmtiles (не file system) — отбрасываем
 *     (до сих пор не наблюдалось, но defensively)
 */
function normalizeFileUri(uri: string): string {
  if (uri.startsWith("file://")) return uri;
  if (uri.startsWith("/")) return `file://${uri}`;
  return uri;
}

const ESRI_SATELLITE_TILES = [
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
];

/**
 * Build style.json для текущего набора forest sources + (опц.) basemap.
 * Если пусто и нет basemap'а — рисуется только paper-фон.
 *
 * baseMap = "satellite" | "hybrid" — поверх raster-источника ESRI World
 * Imagery; в hybrid дополнительно рисуются symbol-слои подписей из
 * pmtiles-basemap'а (без landcover-fill, чтобы не закрывать спутник).
 */
export function buildMapStyle(input: StyleInput | ForestSource[]): Style {
  // Backward-compat: array → treat as forests-only
  const normalized: StyleInput = Array.isArray(input)
    ? { forests: input }
    : input;

  const mode: BaseMapMode = normalized.baseMap ?? "scheme";
  const mapSources: Record<string, unknown> = {};
  const layers: unknown[] = [];

  if (mode === "satellite" || mode === "hybrid") {
    // Спутник как нижний слой. При offline tile-failures MapLibre отдаст
    // прозрачные тайлы — выше идёт fallback на background-paper.
    layers.push({
      id: "background",
      type: "background",
      paint: { "background-color": palette.light.paper },
    });
    mapSources["esri-satellite"] = {
      type: "raster",
      tiles: ESRI_SATELLITE_TILES,
      tileSize: 256,
      maxzoom: 19,
    };
    layers.push({
      id: "esri-satellite",
      type: "raster",
      source: "esri-satellite",
    });

    if (mode === "hybrid" && normalized.basemapPmtilesUri) {
      // Только symbol-слои подписей из basemap-pmtiles. Fill (water,
      // landcover, roads) скрываем — спутник под ними должен быть виден.
      mapSources.basemap = {
        type: "vector",
        url: `pmtiles://${normalizeFileUri(normalized.basemapPmtilesUri)}`,
      };
      const symbolOnly = (buildBasemapLayers() as Array<Record<string, unknown>>).filter(
        (l) => l.type === "symbol",
      );
      // На спутнике подписи белым с тёмным halo — лучше читаются.
      const tinted = symbolOnly.map((l) => ({
        ...l,
        paint: {
          ...((l.paint as Record<string, unknown>) ?? {}),
          "text-color": "#fdfdfd",
          "text-halo-color": "rgba(0,0,0,0.7)",
          "text-halo-width": 1.4,
        },
      }));
      layers.push(...tinted);
    }
  } else {
    // scheme: paper-фон + полные basemap-слои (fill+line+symbol).
    layers.push({
      id: "background",
      type: "background",
      paint: { "background-color": palette.light.paper },
    });
    if (normalized.basemapPmtilesUri) {
      mapSources.basemap = {
        type: "vector",
        url: `pmtiles://${normalizeFileUri(normalized.basemapPmtilesUri)}`,
      };
      layers.push(...buildBasemapLayers());
    }
  }

  // Forest fill — поверх basemap'а / спутника. На satellite/hybrid снижаем
  // непрозрачность, чтобы рельеф читался под раскраской выделов.
  const forestOpacity = mode === "scheme" ? 0.5 : 0.35;

  for (const src of normalized.forests) {
    mapSources[src.id] = {
      type: "vector",
      url: `pmtiles://${normalizeFileUri(src.pmtilesFileUri)}`,
    };
    const isLowZoom = src.sourceLayer === "forest_lo";
    const layer: Record<string, unknown> = {
      id: `${src.id}-fill`,
      type: "fill",
      source: src.id,
      "source-layer": src.sourceLayer ?? "forest",
      paint: {
        "fill-color": SPECIES_COLOR_MATCH as unknown as string,
        "fill-opacity": forestOpacity,
        "fill-outline-color": "rgba(0,0,0,0)",
      },
    };
    // Hard cutoff на z=9 — без overlap'а forest_lo + forest.
    // MapLibre maxzoom = exclusive, minzoom = inclusive.
    // forest_lo: maxzoom 9 (видим z=5-8). forest: minzoom 9 (видим z>=9).
    if (src.minzoom !== undefined) layer.minzoom = src.minzoom;
    else if (!isLowZoom) layer.minzoom = 9;
    if (src.maxzoom !== undefined) layer.maxzoom = src.maxzoom;
    else if (isLowZoom) layer.maxzoom = 9;
    layers.push(layer);
  }

  return {
    version: 8,
    sources: mapSources,
    layers,
    // Glyphs URL нужен только если в стиле есть symbol-layer'ы — у нас
    // basemap-place-* и basemap-water-name. Безопасно ставить всегда:
    // MapLibre Native не дёргает URL пока не нужен render symbol'а.
    glyphs: normalized.glyphsUrl ?? BASEMAP_GLYPHS_URL_FALLBACK,
  };
}

/**
 * Backward-compat alias для Phase 0 single-source spike.
 * @deprecated use buildMapStyle()
 */
export function buildSpikeStyle(forestPmtilesUri: string): Style {
  return buildMapStyle([
    { id: "forest", pmtilesFileUri: forestPmtilesUri },
  ]);
}
