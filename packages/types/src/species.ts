/**
 * Species registry — shared between /api/forest/at (theoretical &
 * empirical species lists) and /api/species/search.
 */

export interface SpeciesRef {
  slug: string;
  name_ru: string;
  name_lat?: string;
  edibility?: string;
  season_months?: number[];
  /** Present on entries from /api/forest/at theoretical list. */
  affinity?: number;
  /** Present on entries from /api/forest/at empirical list. */
  n_observations?: number;
}

export interface SpeciesSearchResult {
  slug: string;
  name_ru: string;
  name_lat?: string;
  edibility?: string;
  season_months?: number[];
  forest_types: string[];
}
