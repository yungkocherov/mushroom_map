/**
 * Single source of truth для шкалы качества user_spot (1-5).
 * Цвет маркера производный от rating — 1=красное, 5=тёмно-зелёное.
 *
 * Шкала фиксирована и должна совпадать с:
 *   - CHECK constraint `rating BETWEEN 1 AND 5` в db/migrations/030_user_spot_rating.sql
 *   - Pydantic Field(ge=1, le=5) в services/api/src/api/routes/cabinet.py
 */

import type { SpotRating } from "@mushroom-map/types";


export interface RatingOption {
  value: SpotRating;
  label: string;     // короткий ярлык под цифрой
  hex: string;       // resolved для MapLibre paint
}


export const RATING_OPTIONS: RatingOption[] = [
  { value: 1, label: "Плохое",      hex: "#c0392b" },
  { value: 2, label: "Так себе",    hex: "#e67e22" },
  { value: 3, label: "Нейтрально",  hex: "#7f8c8d" },
  { value: 4, label: "Хорошее",     hex: "#27ae60" },
  { value: 5, label: "Отличное",    hex: "#1e6f3e" },
];


/** Lookup: SpotRating → resolved hex (для MapLibre paint expressions). */
export const RATING_HEX: Record<SpotRating, string> = Object.fromEntries(
  RATING_OPTIONS.map((o) => [o.value, o.hex]),
) as Record<SpotRating, string>;


/** Lookup: SpotRating → label (для отображения в UI). */
export const RATING_LABEL: Record<SpotRating, string> = Object.fromEntries(
  RATING_OPTIONS.map((o) => [o.value, o.label]),
) as Record<SpotRating, string>;
