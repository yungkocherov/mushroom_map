import { palette } from "@mushroom-map/tokens/native";

/**
 * Phase 0 spike map style. Minimal — paints forest polygons by
 * dominant_species over a flat paper-coloured background. No basemap
 * (basemap.pmtiles will land in Phase 2).
 *
 * Source URL is passed in at runtime so we can swap between bundled
 * test asset and downloaded per-district pmtiles.
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

export function buildSpikeStyle(forestPmtilesUri: string): Style {
  return {
    version: 8,
    sources: {
      forest: {
        type: "vector",
        url: `pmtiles://${forestPmtilesUri}`,
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: {
          "background-color": palette.light.paper,
        },
      },
      {
        id: "forest-fill",
        type: "fill",
        source: "forest",
        "source-layer": "forest",
        minzoom: 8,
        paint: {
          "fill-color": SPECIES_COLOR_MATCH as unknown as string,
          "fill-opacity": 0.85,
          "fill-outline-color": palette.light.forestDeep,
        },
      },
    ],
  };
}
