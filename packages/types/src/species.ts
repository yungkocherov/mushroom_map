/**
 * Species registry — shared между /api/forest/at (theoretical &
 * empirical species lists), /api/species/search и полным каталогом
 * /api/species/ + /api/species/:slug.
 */

export type Edibility =
  | "edible"
  | "conditionally_edible"
  | "inedible"
  | "toxic"
  | "deadly";


export interface SpeciesRef {
  slug: string;
  name_ru: string;
  name_lat?: string;
  edibility?: Edibility;
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
  edibility?: Edibility;
  season_months?: number[];
  forest_types: string[];
}


// ── Каталог ─────────────────────────────────────────────────────────
// GET /api/species/  -> SpeciesListItem[] (полный справочник для /species)

export interface SpeciesListItem {
  slug: string;
  name_ru: string;
  name_lat: string | null;
  edibility: Edibility;
  season_months: number[];
  photo_url: string | null;
  red_book: boolean;
  /** Топ-3 типа леса, по убыванию affinity. Для карточки каталога. */
  forest_types: string[];
}


// GET /api/species/:slug  -> SpeciesDetail (для страницы вида)

export interface SpeciesSimilar {
  slug: string;
  /** display-friendly — в чём отличие, чем опасен. Свободный текст. */
  note: string;
}


export interface SpeciesForestAffinity {
  forest_type: string;
  affinity: number;
  note: string | null;
}


export interface SpeciesDetail {
  slug: string;
  name_ru: string;
  name_lat: string | null;
  synonyms: string[];
  genus: string | null;
  family: string | null;
  edibility: Edibility;
  season_months: number[];
  description: string | null;
  photo_url: string | null;
  wiki_url: string | null;
  red_book: boolean;
  /** Полный список лесных affinity (не топ-3, а всё). */
  forests: SpeciesForestAffinity[];
  /** Двойники. Может быть []. Свободные slugs — не все обязаны
   *  резолвиться в нашу БД (например, ссылаемся на Amanita phalloides
   *  даже если её детальной карточки ещё нет). */
  similars: SpeciesSimilar[];
  /** Заметки по кулинарии. Может быть null если не написано. */
  cooking: string | null;
}
