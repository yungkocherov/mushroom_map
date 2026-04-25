/**
 * Человекочитаемые лейблы для slug'ов. Разделяется между каталогом
 * видов (`/species`, `/species/:slug`) и будущими фильтрами на карте.
 *
 * Forest-лейблы зеркалят `FOREST_TYPES` из `components/Legend.tsx`;
 * при добавлении новой породы туда нужно синхронно обновлять сюда.
 * Два отдельных списка — сознательно: Legend — для карты-легенды
 * (порядок важен, привязка к colorMode), здесь — плоский lookup.
 */

import type { Edibility } from "@mushroom-map/types";


export const EDIBILITY_LABEL: Record<Edibility, string> = {
  edible:               "Съедобный",
  conditionally_edible: "Условно съедобный",
  inedible:             "Несъедобный",
  toxic:                "Ядовитый",
  deadly:               "Смертельно ядовитый",
};

// Тона через CSS-переменные из tokens.css. Значения оформлены как
// `{ bg, fg }`; компонент EdibilityChip маппит в inline-стили.
export const EDIBILITY_TONE: Record<Edibility, { bg: string; fg: string }> = {
  edible:               { bg: "var(--moss)",        fg: "#fff" },
  conditionally_edible: { bg: "var(--caution)",     fg: "#fff" },
  inedible:             { bg: "var(--rule)",        fg: "var(--ink-dim)" },
  toxic:                { bg: "var(--danger)",      fg: "#fff" },
  deadly:               { bg: "var(--danger)",      fg: "#fff" },
};


export const FOREST_LABEL: Record<string, string> = {
  pine:              "Сосна",
  spruce:            "Ель",
  larch:             "Лиственница",
  fir:               "Пихта",
  cedar:             "Кедр",
  birch:             "Берёза",
  aspen:             "Осина",
  alder:             "Ольха",
  oak:               "Дуб",
  linden:            "Липа",
  maple:             "Клён",
  mixed_coniferous:  "Смеш. хвойный",
  mixed_broadleaved: "Смеш. лиственный",
  mixed:             "Смешанный",
  unknown:           "Неизвестно",
};


const MONTHS_RU = [
  "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
  "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек",
];

export const monthLabel = (m: number): string =>
  MONTHS_RU[Math.max(0, Math.min(11, m - 1))];
