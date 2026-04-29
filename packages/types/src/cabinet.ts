/**
 * Cabinet — приватные данные юзера. Зеркалит /api/cabinet/* ответы из
 * services/api/src/api/routes/cabinet.py.
 */

/** 1-5 оценка качества места. 1=плохое, 5=отличное. */
export type SpotRating = 1 | 2 | 3 | 4 | 5;


export interface UserSpot {
  id: string;
  name: string;
  note: string;
  rating: SpotRating;
  /** Slug'и из apps/web/src/lib/spotTags.ts (деревья + грибы + ягоды). */
  tags: string[];
  lat: number;
  lon: number;
  created_at: string;
  updated_at: string;
}


export interface SpotCreatePayload {
  name: string;
  note?: string;
  rating?: SpotRating;
  tags?: string[];
  lat: number;
  lon: number;
}


export interface SpotPatchPayload {
  name?: string;
  note?: string;
  rating?: SpotRating;
  tags?: string[];
}
