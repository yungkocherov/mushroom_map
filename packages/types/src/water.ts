/**
 * /api/water/distance/at — minimum distance to water across three
 * sources (OSM waterways, water zones, wetlands), plus per-source.
 */

export type WaterKind = "waterway" | "water_zone" | "wetland";

export interface WaterCandidate {
  kind: WaterKind;
  subtype: string | null;
  name: string | null;
  distance_m: number;
}

export interface WaterDistanceResponse {
  lat: number;
  lon: number;
  nearest: WaterCandidate | null;
  by_source: {
    waterway: WaterCandidate | null;
    water_zone: WaterCandidate | null;
    wetland: WaterCandidate | null;
  };
}
