/**
 * /api/soil/at — Докучаевская почвенная карта (1:2.5М) плюс
 * ближайший точечный разрез (до 50 км по умолчанию).
 */

export interface SoilTypeRef {
  id: number;
  symbol?: string;
  descript: string;
  zone?: string;
}

export interface SoilPolygon {
  poligon_id: number;
  soil0: SoilTypeRef;
  soil1: { id: number; descript: string } | null;
  soil2: { id: number; descript: string } | null;
  soil3: { id: number; descript: string } | null;
  parent1: { id: number; name: string } | null;
  parent2: { id: number; name: string } | null;
  area_m2: number | null;
}

export interface SoilProfileHorizon {
  top: number | null;
  bot: number | null;
  name: string | null;
  ph: number | null;
  corg: number | null;
}

export interface SoilProfile {
  card_id: number;
  rusm: string | null;
  wrb06: string | null;
  rureg: string | null;
  location: string | null;
  landuse: string | null;
  veg_assoc: string | null;
  ph_h2o: number | null;
  ph_salt: number | null;
  corg: number | null;
  altitude_m: number | null;
  horizons: SoilProfileHorizon[];
  distance_km: number;
}

export interface SoilAtResponse {
  lat: number;
  lon: number;
  polygon: SoilPolygon | null;
  profile_nearest: SoilProfile | null;
}
