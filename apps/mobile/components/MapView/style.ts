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
  "birch", "#eee8da",
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

export type StyleInput = {
  forests: ForestSource[];
  /** OpenMapTiles-schema basemap (planetiler output). Optional. */
  basemapPmtilesUri?: string | null;
};

/**
 * Layers OpenMapTiles schema, которые мы рисуем (subset, optimized for
 * forest-day use case): water, waterway, transportation, boundary,
 * landcover. Pruning'ом стараемся не перегружать карту: урбанистика /
 * housenumbers / poi скрыты (грибнику не нужны магазины и mailboxes).
 *
 * Symbol-слои (place-names) ОТКЛЮЧЕНЫ в v0 — для них нужен bundled
 * `glyphs` PBF-pack, иначе MapLibre Native шлёт fetch на empty URL и
 * выдаёт `[HTTP] Unable to parse resourceUrl`. Bundled-шрифты — Phase 5.
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

/**
 * Build style.json для текущего набора forest sources + (опц.) basemap.
 * Если пусто и нет basemap'а — рисуется только paper-фон.
 */
export function buildMapStyle(input: StyleInput | ForestSource[]): Style {
  // Backward-compat: array → treat as forests-only
  const normalized: StyleInput = Array.isArray(input)
    ? { forests: input }
    : input;

  const mapSources: Record<string, unknown> = {};
  const layers: unknown[] = [
    {
      id: "background",
      type: "background",
      paint: {
        "background-color": palette.light.paper,
      },
    },
  ];

  if (normalized.basemapPmtilesUri) {
    mapSources.basemap = {
      type: "vector",
      url: `pmtiles://${normalizeFileUri(normalized.basemapPmtilesUri)}`,
    };
    layers.push(...buildBasemapLayers());
  }

  for (const src of normalized.forests) {
    mapSources[src.id] = {
      type: "vector",
      url: `pmtiles://${normalizeFileUri(src.pmtilesFileUri)}`,
    };
    const layer: Record<string, unknown> = {
      id: `${src.id}-fill`,
      type: "fill",
      source: src.id,
      "source-layer": src.sourceLayer ?? "forest",
      paint: {
        "fill-color": SPECIES_COLOR_MATCH as unknown as string,
        "fill-opacity": 0.5,
        "fill-outline-color": "rgba(0,0,0,0)",
      },
    };
    if (src.minzoom !== undefined) layer.minzoom = src.minzoom;
    else if (src.sourceLayer !== "forest_lo") layer.minzoom = 8;
    if (src.maxzoom !== undefined) layer.maxzoom = src.maxzoom;
    layers.push(layer);
  }

  return {
    version: 8,
    sources: mapSources,
    layers,
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
