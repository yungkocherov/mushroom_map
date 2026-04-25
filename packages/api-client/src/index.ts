/**
 * mushroom-map API client.
 *
 * Typed fetch wrappers around the FastAPI surface. Platform-agnostic —
 * no DOM or React assumptions, works in browsers (Vite / SWC / webpack)
 * and non-browser runtimes (future RN via Metro) alike.
 *
 * API base URL resolution:
 *   1. Vite's import.meta.env.VITE_API_URL (browser dev builds)
 *   2. empty string — requests go to the same origin (production when
 *      the web app is served from behind a reverse-proxy that already
 *      exposes /api, and Vite dev when the dev-server proxies /api)
 *
 * Future RN clients should pass an explicit `baseUrl` via a factory;
 * that factory will arrive together with the mobile app. For now the
 * fallbacks cover the browser case, which is all we ship.
 */

import type {
  ForestAtResponse,
  SoilAtResponse,
  WaterDistanceResponse,
  TerrainAtResponse,
  SpeciesSearchResult,
  NominatimResult,
  StatsOverview,
  SpeciesNowResponse,
  AuthUser,
  AuthRefreshResponse,
} from "@mushroom-map/types";

function resolveApiBase(): string {
  // Safe `import.meta.env` access — Vite augments it in the web build,
  // pure-TS contexts treat import.meta as empty. The `as any` lets
  // tsc be happy without a reference to Vite's types in this package.
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.VITE_API_URL ?? "";
}

const API_BASE = resolveApiBase();

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

export async function fetchStatsOverview(): Promise<StatsOverview> {
  const url = `${API_BASE}/api/stats/overview`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`stats/overview ${res.status}`);
  return res.json();
}

export async function fetchSpeciesNow(window = "14d", limit = 5): Promise<SpeciesNowResponse> {
  const url = `${API_BASE}/api/stats/vk/species-now?window=${window}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`stats/vk/species-now ${res.status}`);
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────
// Refresh и logout — cookie-based, обязательно credentials:"include",
// иначе cross-origin fetch (dev proxy тоже относится к этому классу)
// не отправляет HttpOnly cookie. fetchMe принимает access_token
// аргументом, чтобы клиент не знал как его хранит потребитель.

/** Абсолютный URL, на который надо редиректить браузер для OAuth login
 *  через Yandex ID. Возвращается как URL, а не fetch, чтобы навигация
 *  прошла в top-level window (нужно для 302 → oauth.yandex.ru). */
export function authYandexLoginUrl(): string {
  return `${API_BASE}/api/auth/yandex/login`;
}

export async function authRefresh(): Promise<AuthRefreshResponse | null> {
  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (res.status === 401) return null;          // нет/истёкший cookie
  if (!res.ok) throw new Error(`auth/refresh ${res.status}`);
  return res.json();
}

export async function authLogout(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
  // 204 No Content — всё норм. Любой другой код игнорируем: logout
  // должен быть мягким, чтобы разлогинить клиента даже если сервер лёг.
  if (!res.ok && res.status !== 204) {
    // не кидаем, но сигнализируем через console (фронт всё равно очистит state)
    // eslint-disable-next-line no-console
    console.warn(`auth/logout returned ${res.status}`);
  }
}

export async function fetchMe(accessToken: string): Promise<AuthUser> {
  const res = await fetch(`${API_BASE}/api/user/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`user/me ${res.status}`);
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
