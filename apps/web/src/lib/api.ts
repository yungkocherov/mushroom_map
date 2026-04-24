/**
 * Клиент к API.
 * В dev Vite проксирует /api и /tiles на VITE_API_URL (см. vite.config.ts).
 *
 * Types live in @mushroom-map/types. This file will itself move to
 * @mushroom-map/api-client in Phase 0 commit (e).
 */

import type {
  ForestAtResponse,
  SoilAtResponse,
  WaterDistanceResponse,
  TerrainAtResponse,
  SpeciesSearchResult,
  NominatimResult,
} from "@mushroom-map/types";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export async function fetchForestAt(lat: number, lon: number): Promise<ForestAtResponse> {
  const url = `${API_BASE}/api/forest/at?lat=${lat}&lon=${lon}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`forest/at ${res.status}`);
  return res.json();
}

export async function fetchSoilAt(lat: number, lon: number): Promise<SoilAtResponse> {
  const url = `${API_BASE}/api/soil/at?lat=${lat}&lon=${lon}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`soil/at ${res.status}`);
  return res.json();
}

export async function fetchWaterDistanceAt(lat: number, lon: number): Promise<WaterDistanceResponse> {
  const url = `${API_BASE}/api/water/distance/at?lat=${lat}&lon=${lon}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`water/distance/at ${res.status}`);
  return res.json();
}

export async function fetchTerrainAt(lat: number, lon: number): Promise<TerrainAtResponse> {
  const url = `${API_BASE}/api/terrain/at?lat=${lat}&lon=${lon}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`terrain/at ${res.status}`);
  return res.json();
}

export async function searchSpecies(q: string, limit = 10): Promise<SpeciesSearchResult[]> {
  if (!q.trim()) return [];
  const url = `${API_BASE}/api/species/search?q=${encodeURIComponent(q)}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  return res.json();
}

export async function searchPlaces(q: string): Promise<NominatimResult[]> {
  if (!q.trim()) return [];
  const params = new URLSearchParams({
    q,
    format: "json",
    limit: "5",
    countrycodes: "ru",
    "accept-language": "ru",
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "User-Agent": "mushroom-map/1.0" },
  });
  if (!res.ok) return [];
  return res.json();
}
