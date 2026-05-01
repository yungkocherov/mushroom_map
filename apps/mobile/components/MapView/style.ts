import { palette } from "@mushroom-map/tokens/native";

/**
 * Phase 2 map style. Multi-source: один vector source per downloaded
 * region (forest-{slug}). Когда юзер ничего не скачал — fallback на
 * bundled `forest-luzhsky.pmtiles` placeholder (Phase 0 spike).
 *
 * Phase 2.3 (basemap pipeline) добавит ещё `basemap` source снизу
 * (paper фон сейчас выступает как placeholder под выделами).
 */

const SPECIES_COLOR_MATCH = [
  "match",
  ["coalesce", ["get", "dominant_species"], "mixed"],
  "pine", "#5a7a3a",
  "spruce", "#3a5a45",
  "birch", "#bcc890",
  "aspen", "#a8b87a",
  "oak", "#7a8c2e",
  "alder", "#6b8050",
  "willow", "#9bb47a",
  "fir", "#3a5a4f",
  "larch", "#7a9b3a",
  "linden", "#a0a85a",
  "maple", "#8c9a45",
  "ash", "#7a8a3a",
  "elm", "#6b7a3a",
  "mixed", "#7a9b64",
  /* default */ palette.light.moss,
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
};

/**
 * Build style.json для текущего набора forest sources. Если пусто —
 * рисуется только paper-фон (юзер увидит пустой экран и поймёт что
 * нужно скачать регион).
 */
export function buildMapStyle(sources: ForestSource[]): Style {
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

  for (const src of sources) {
    mapSources[src.id] = {
      type: "vector",
      url: `pmtiles://${src.pmtilesFileUri}`,
    };
    layers.push({
      id: `${src.id}-fill`,
      type: "fill",
      source: src.id,
      "source-layer": "forest",
      minzoom: 8,
      paint: {
        "fill-color": SPECIES_COLOR_MATCH as unknown as string,
        "fill-opacity": 0.85,
        "fill-outline-color": palette.light.forestDeep,
      },
    });
  }

  return {
    version: 8,
    sources: mapSources,
    layers,
  };
}

/**
 * Backward-compat alias для Phase 0 single-source spike. Удалить
 * после того как SpikeMap полностью переедет на multi-source.
 *
 * @deprecated use buildMapStyle()
 */
export function buildSpikeStyle(forestPmtilesUri: string): Style {
  return buildMapStyle([
    { id: "forest", pmtilesFileUri: forestPmtilesUri },
  ]);
}
