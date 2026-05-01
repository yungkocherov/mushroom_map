import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";

const AFFINITY_ASSET = require("../assets/species-affinity.json");

type AffinityPair = { tree: string; affinity: number };

type AffinityPayload = {
  schema_version: number;
  generated_at: string;
  species: Record<string, AffinityPair[]>;
};

let cached: AffinityPayload | null = null;

async function load(): Promise<AffinityPayload> {
  if (cached) return cached;
  const asset = Asset.fromModule(AFFINITY_ASSET);
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error("species-affinity asset has no localUri");
  const raw = await FileSystem.readAsStringAsync(asset.localUri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  cached = JSON.parse(raw) as AffinityPayload;
  return cached;
}

export type SpeciesForTree = {
  slug: string;
  affinity: number;
};

/**
 * Top-N species which have positive affinity для данного `forest_type`
 * (берёза, сосна, ель, и т.д.). Используется в popup'е выдела:
 * "Виды по биотопу" для tap'нутого dominant_species.
 */
export async function topSpeciesForForestType(
  forestType: string,
  limit = 5,
): Promise<SpeciesForTree[]> {
  if (!forestType) return [];
  const payload = await load();
  const out: SpeciesForTree[] = [];
  for (const [slug, pairs] of Object.entries(payload.species)) {
    const match = pairs.find((p) => p.tree === forestType);
    if (match && match.affinity > 0.3) {
      out.push({ slug, affinity: match.affinity });
    }
  }
  out.sort((a, b) => b.affinity - a.affinity);
  return out.slice(0, limit);
}
