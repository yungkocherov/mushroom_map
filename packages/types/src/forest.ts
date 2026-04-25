/**
 * /api/forest/at response shape. Reflects forest_unified view from
 * the PostGIS side plus the species registry merge.
 */

import type { SpeciesRef } from "./species";

export interface ForestInfo {
  dominant_species: string;
  species_composition: Record<string, number> | null;
  source: string;
  confidence: number;
  area_m2: number | null;
  /** Класс бонитета 1..5 (1 = самый продуктивный). */
  bonitet: number | null;
  /** Запас древесины, м³/га. */
  timber_stock: number | null;
  /** Группа возраста («спелые», «молодняки», ...). */
  age_group: string | null;
}

export interface ForestAtResponse {
  lat: number;
  lon: number;
  forest: ForestInfo | null;
  /** Виды грибов, теоретически ассоциированные с типом леса (affinity). */
  species_theoretical: SpeciesRef[];
}
