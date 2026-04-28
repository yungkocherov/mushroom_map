// API origin — определяется по приоритету:
//   1. VITE_API_URL — если задан (prod build, dev override). Это
//      каноничный путь к API на отдельном домене (api.geobiom.ru).
//   2. window.location.origin — fallback, если фронт и API на одном
//      origin (старый сценарий, Caddy на VM раздаёт оба).
//   3. http://localhost:8000 — dev-default когда нет ничего.
// `||` (не `??`) — чтобы пустая строка из CI env не считалась "задан".
export const API_ORIGIN =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:8000" : window.location.origin);

// Base URL для PMTiles. В prod выгоднее раздавать через CDN (Cloudflare R2 +
// custom domain типа https://tiles.geobiom.ru) — Range requests поддерживаются
// out-of-the-box, а API освобождается от мегабайтов трафика. Если
// VITE_TILES_URL не задан (или пустая строка) — fallback на API_ORIGIN/tiles.
// Конечные URL'ы строятся как `${TILES_BASE}/<file>.pmtiles`, поэтому здесь
// без trailing slash и без '/tiles' для CDN-варианта (там файлы лежат в
// корне bucket'а). Используем `||`, не `??` — иначе пустая строка из
// CI env пройдёт как валидное значение и фронт поломается.
export const TILES_BASE =
  import.meta.env.VITE_TILES_URL || `${API_ORIGIN}/tiles`;
