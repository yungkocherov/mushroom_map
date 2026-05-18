import type {
  ForestAtResponse,
  SoilAtResponse,
  WaterDistanceResponse,
  TerrainAtResponse,
} from "@mushroom-map/types";
import { getApiBaseUrl } from "./api";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function fetchForestAt(lat: number, lon: number) {
  return getJson<ForestAtResponse>(`/api/forest/at?lat=${lat}&lon=${lon}`);
}
export function fetchSoilAt(lat: number, lon: number) {
  return getJson<SoilAtResponse>(`/api/soil/at?lat=${lat}&lon=${lon}`);
}
export function fetchWaterDistanceAt(lat: number, lon: number) {
  return getJson<WaterDistanceResponse>(`/api/water/distance/at?lat=${lat}&lon=${lon}`);
}
export function fetchTerrainAt(lat: number, lon: number) {
  return getJson<TerrainAtResponse>(`/api/terrain/at?lat=${lat}&lon=${lon}`);
}

export type PopupData = {
  forest: ForestAtResponse;
  soil: SoilAtResponse | null;
  water: WaterDistanceResponse | null;
  terrain: TerrainAtResponse | null;
};

/** Mirrors web useMapPopup: forest required, others degrade per-source. */
export async function fetchPopupData(lat: number, lon: number): Promise<PopupData> {
  const [forest, soil, water, terrain] = await Promise.all([
    fetchForestAt(lat, lon),
    fetchSoilAt(lat, lon).catch(() => null),
    fetchWaterDistanceAt(lat, lon).catch(() => null),
    fetchTerrainAt(lat, lon).catch(() => null),
  ]);
  return { forest, soil, water, terrain };
}
