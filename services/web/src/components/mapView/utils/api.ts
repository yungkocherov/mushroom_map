// В dev PMTiles идёт напрямую к API (Vite proxy не поддерживает Range-запросы).
// В prod файл отдаётся same-origin, поэтому используем window.location.origin.
export const API_ORIGIN = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL ?? "http://localhost:8000")
  : window.location.origin;
