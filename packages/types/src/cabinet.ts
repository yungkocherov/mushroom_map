/**
 * Cabinet — приватные данные юзера. Зеркалит /api/cabinet/* ответы из
 * services/api/src/api/routes/cabinet.py.
 */

export type SpotColor =
  | "forest"
  | "chanterelle"
  | "birch"
  | "moss"
  | "danger";


export interface UserSpot {
  id: string;
  name: string;
  note: string;
  color: SpotColor;
  lat: number;
  lon: number;
  created_at: string;
  updated_at: string;
}


export interface SpotCreatePayload {
  name: string;
  note?: string;
  color?: SpotColor;
  lat: number;
  lon: number;
}


export interface SpotPatchPayload {
  name?: string;
  note?: string;
  color?: SpotColor;
}
