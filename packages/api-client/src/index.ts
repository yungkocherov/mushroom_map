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
  SpeciesListItem,
  SpeciesDetail,
  NominatimResult,
  StatsOverview,
  SpeciesNowResponse,
  AuthUser,
  AuthRefreshResponse,
  UserSpot,
  SpotCreatePayload,
  SpotPatchPayload,
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

export async function listSpecies(): Promise<SpeciesListItem[]> {
  const res = await fetch(`${API_BASE}/api/species/`);
  if (!res.ok) throw new Error(`species list ${res.status}`);
  return res.json();
}

export async function fetchSpeciesDetail(slug: string): Promise<SpeciesDetail | null> {
  const res = await fetch(`${API_BASE}/api/species/${encodeURIComponent(slug)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`species/${slug} ${res.status}`);
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


// ─────────────────────────────────────────────────────────────────────
// Cabinet (protected — все вызовы требуют Bearer access token)
// ─────────────────────────────────────────────────────────────────────

function authHeaders(accessToken: string): HeadersInit {
  return {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type":  "application/json",
  };
}

export async function listSpots(accessToken: string): Promise<UserSpot[]> {
  const res = await fetch(`${API_BASE}/api/cabinet/spots`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) throw new Error(`cabinet/spots ${res.status}`);
  return res.json();
}

export async function createSpot(accessToken: string, payload: SpotCreatePayload): Promise<UserSpot> {
  const res = await fetch(`${API_BASE}/api/cabinet/spots`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`createSpot ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.json();
}

export async function patchSpot(
  accessToken: string,
  id: string,
  payload: SpotPatchPayload,
): Promise<UserSpot> {
  const res = await fetch(`${API_BASE}/api/cabinet/spots/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`patchSpot ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.json();
}

export async function deleteSpot(accessToken: string, id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/cabinet/spots/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`deleteSpot ${res.status}`);
  }
}

/**
 * Spotlight (⌘K) — поиск по `gazetteer_entry` через FastAPI.
 * Используется отдельно от `searchPlaces` (Nominatim) — тот остался
 * для существующего адресного поиска на карте.
 */
export interface GazetteerSearchResult {
  id: number;
  /** Русское название топонима. API отдаёт ключом `name` (не name_ru). */
  name: string;
  kind: string;
  lat: number;
  lon: number;
  /** API возвращает `district_admin_area_id`. Раньше тип ошибочно назывался
   *  `admin_area_id` — на фронт оба не используются, но сохраняем верный
   *  ключ для type-safety при будущих использованиях. */
  district_admin_area_id: number | null;
  /** Имя района (admin_area level=6) — для контекста в Spotlight. null
   *  если у топонима не определён район (например, поверхность Ладоги). */
  district_name: string | null;
  /** Название региона из `region.name_ru` («Ленинградская область»). */
  region_name: string;
  popularity: number;
  score: number;
}

export async function searchGazetteer(
  q: string,
  limit = 10,
): Promise<GazetteerSearchResult[]> {
  if (q.trim().length < 2) return [];
  const url = `${API_BASE}/api/places/search?q=${encodeURIComponent(q)}&limit=${limit}`;
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


// ──────────────────────────────────────────────────────────────────────
// Feedback (V4 redesign-2026-05-10)
// ──────────────────────────────────────────────────────────────────────

export interface FeedbackPayload {
  message: string;
  contact?: string;
  page_url?: string;
}

/**
 * POST /api/feedback — короткое сообщение от посетителя сайта.
 * Auth опционален (если есть Bearer-token, бэк привяжет к user_id).
 * Вернёт `{id}` или бросит Error на 4xx/5xx.
 */
export async function submitFeedback(
  payload: FeedbackPayload,
  accessToken?: string,
): Promise<{ id: number }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${API_BASE}/api/feedback`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`feedback failed: ${res.status} ${t || res.statusText}`);
  }
  return res.json();
}


// ──────────────────────────────────────────────────────────────────────
// Forest legend (V4.3) — реальные значения из БД, не хардкод
// ──────────────────────────────────────────────────────────────────────

export interface ForestLegendSpecies { slug: string; label: string; count: number; }
export interface ForestLegendBonitet { value: number; label: string; count: number; }
export interface ForestLegendAgeGroup { value: string; label: string; count: number; }

export interface ForestLegendResponse {
  species:   ForestLegendSpecies[];
  bonitet:   ForestLegendBonitet[];
  age_group: ForestLegendAgeGroup[];
}

/**
 * GET /api/forest/legend — распределение реальных значений
 * dominant_species / bonitet / age_group из forest_polygon. Frontend
 * Legend.tsx строит легенду по этому ответу вместо hardcode'а.
 * Кэшируется в-memory на стороне фронта (single fetch на сессию).
 */
export async function fetchForestLegend(): Promise<ForestLegendResponse> {
  const res = await fetch(`${API_BASE}/api/forest/legend`);
  if (!res.ok) throw new Error(`forest/legend ${res.status}`);
  return res.json();
}
