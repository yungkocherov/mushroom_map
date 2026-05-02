import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";

const CATALOG_ASSET = require("../assets/species-catalog.json");

export type SpeciesEdibility =
  | "edible"
  | "edible_with_caveat"
  | "inedible"
  | "poisonous"
  | "deadly"
  | "unknown";

export type SpeciesEntry = {
  name_ru: string;
  name_lat: string;
  edibility: SpeciesEdibility;
  season_months: number[]; // 1-12
  red_book: boolean;
  forest_types: string[];
};

type Catalog = {
  schema_version: number;
  species: Record<string, SpeciesEntry>;
};

let cached: Catalog | null = null;

async function load(): Promise<Catalog> {
  if (cached) return cached;
  const asset = Asset.fromModule(CATALOG_ASSET);
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error("species-catalog asset has no localUri");
  const raw = await FileSystem.readAsStringAsync(asset.localUri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  cached = JSON.parse(raw) as Catalog;
  return cached;
}

/** Synchronous lookup that requires preload(). Useful in render. */
export function getSpeciesSync(slug: string): SpeciesEntry | undefined {
  return cached?.species[slug];
}

/** Synchronous Russian name fallback ("Белый гриб" or slug). */
export function speciesNameRu(slug: string): string {
  return cached?.species[slug]?.name_ru || slug;
}

export async function preloadCatalog(): Promise<void> {
  await load();
}

export async function getCatalogList(): Promise<
  Array<{ slug: string } & SpeciesEntry>
> {
  const c = await load();
  return Object.entries(c.species).map(([slug, entry]) => ({ slug, ...entry }));
}
