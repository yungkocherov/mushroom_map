/**
 * Single source of truth для цветов user_spot маркеров.
 *
 * Шкала фиксирована и должна совпадать с:
 *   - CHECK constraint `user_spot_color_chk` в db/migrations/028_user_spot.sql
 *   - ALLOWED_COLORS в services/api/src/api/routes/cabinet.py
 *
 * `cssVar` — для DOM (form radio dot, dot в списке). `hex` — для
 * MapLibre paint expression (нужен resolved-цвет, var(...) не работает
 * внутри paint).
 */

import type { SpotColor } from "@mushroom-map/types";


export interface SpotColorOption {
  value: SpotColor;
  label: string;
  cssVar: string;
  hex: string;
}


export const SPOT_COLOR_OPTIONS: SpotColorOption[] = [
  { value: "forest",      label: "Лес",       cssVar: "var(--forest)",      hex: "#2d5a3a" },
  { value: "chanterelle", label: "Лисичка",   cssVar: "var(--chanterelle)", hex: "#d88c1e" },
  { value: "moss",        label: "Мох",       cssVar: "var(--moss)",        hex: "#7a9b64" },
  { value: "birch",       label: "Берёза",    cssVar: "var(--birch)",       hex: "#e8e2d1" },
  { value: "danger",      label: "Опасность", cssVar: "var(--danger)",      hex: "#8b2a2a" },
];


/** Lookup: SpotColor → resolved hex (для MapLibre paint expressions). */
export const SPOT_COLOR_HEX: Record<SpotColor, string> = Object.fromEntries(
  SPOT_COLOR_OPTIONS.map((o) => [o.value, o.hex]),
) as Record<SpotColor, string>;


/** Lookup: SpotColor → CSS-переменная (для inline style в React). */
export const SPOT_COLOR_CSS: Record<SpotColor, string> = Object.fromEntries(
  SPOT_COLOR_OPTIONS.map((o) => [o.value, o.cssVar]),
) as Record<SpotColor, string>;
