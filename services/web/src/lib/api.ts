/**
 * Клиент к API.
 * В dev Vite проксирует /api и /tiles на VITE_API_URL (см. vite.config.ts).
 */

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export interface ForestInfo {
  dominant_species: string;
  species_composition: Record<string, number> | null;
  source: string;
  confidence: number;
  area_m2: number | null;
  bonitet: number | null;       // класс бонитета 1..5 (1 = самый продуктивный)
  timber_stock: number | null;  // запас древесины, м³/га
  age_group: string | null;     // группа возраста («спелые», «молодняки», ...)
}

export interface SpeciesRef {
  slug: string;
  name_ru: string;
  name_lat?: string;
  edibility?: string;
  season_months?: number[];
  affinity?: number;        // для теоретических
  n_observations?: number;  // для эмпирических
}

export interface ForestAtResponse {
  lat: number;
  lon: number;
  forest: ForestInfo | null;
  species_theoretical: SpeciesRef[];
  species_empirical: SpeciesRef[];
}

export async function fetchForestAt(lat: number, lon: number): Promise<ForestAtResponse> {
  const url = `${API_BASE}/api/forest/at?lat=${lat}&lon=${lon}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`forest/at ${res.status}`);
  return res.json();
}
