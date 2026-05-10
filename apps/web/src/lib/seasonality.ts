/**
 * Seasonality data for the year-ribbon calendar.
 *
 * Hardcoded for the redesign-2026-05 calendar route. Future revision
 * may pull from `species.seasonality_*` columns or from forecast
 * model output, but the design works fine with curator-set values
 * (Source: docs/redesign-2026-05/claude-design/src/d1v2-suite.jsx:222-234).
 */

export type SpeciesSeason = {
  /** Russian common name. */
  ru: string;
  /** Latin binomial. */
  lat: string;
  /** First month with non-zero fruiting (1..12). */
  start: number;
  /** Last month with non-zero fruiting (1..12). */
  end: number;
  /** Peak month (1..12). */
  peak: number;
  /** Hex color used for the bar fill. */
  color: string;
};

export const SPECIES_SEASONS: ReadonlyArray<SpeciesSeason> = [
  { ru: "Белый гриб",       lat: "Boletus edulis",        start: 6, end: 10, peak: 8,  color: "#3e4827" }, // mossDeep
  { ru: "Подберёзовик",     lat: "Leccinum scabrum",      start: 6, end: 10, peak: 8,  color: "#5d6a3a" }, // moss
  { ru: "Подосиновик",      lat: "Leccinum aurantiacum",  start: 7, end: 9,  peak: 8,  color: "#b86a3a" }, // terra
  { ru: "Лисичка",          lat: "Cantharellus cibarius", start: 6, end: 9,  peak: 7,  color: "#bd9a3a" },
  { ru: "Груздь настоящий", lat: "Lactarius resimus",     start: 7, end: 9,  peak: 8,  color: "#a47d5a" },
  { ru: "Волнушка розовая", lat: "Lactarius torminosus",  start: 7, end: 9,  peak: 9,  color: "#c98c7a" },
  { ru: "Опёнок осенний",   lat: "Armillaria mellea",     start: 8, end: 10, peak: 9,  color: "#7a5a3a" }, // bark
  { ru: "Сыроежка",         lat: "Russula sp.",           start: 6, end: 10, peak: 7,  color: "#8a8a4a" },
  { ru: "Моховик",          lat: "Xerocomus sp.",         start: 6, end: 10, peak: 8,  color: "#6e7a3a" },
  { ru: "Сморчок",          lat: "Morchella esculenta",   start: 4, end: 5,  peak: 5,  color: "#bd9a6a" },
  { ru: "Вешенка",          lat: "Pleurotus ostreatus",   start: 9, end: 11, peak: 10, color: "#9a8a7a" },
  { ru: "Рыжик",            lat: "Lactarius deliciosus",  start: 7, end: 9,  peak: 9,  color: "#c4742a" },
];

export const MONTH_LABELS_FULL = [
  "ЯНВ", "ФЕВ", "МАР", "АПР", "МАЙ", "ИЮН",
  "ИЮЛ", "АВГ", "СЕН", "ОКТ", "НОЯ", "ДЕК",
] as const;
