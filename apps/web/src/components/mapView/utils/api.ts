// В dev PMTiles идёт напрямую к API (Vite proxy не поддерживает Range-запросы).
// В prod файл отдаётся same-origin, поэтому используем window.location.origin.
export const API_ORIGIN = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL ?? "http://localhost:8000")
  : window.location.origin;

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
