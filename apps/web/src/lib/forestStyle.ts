/**
 * Цвета лесного слоя. Slug'и синхронизированы с geodata.types.ForestTypeSlug (Python).
 */

export const FOREST_TEXTURE_SLUGS = [
  "pine",
  "spruce",
  "larch",
  "fir",
  "cedar",
  "birch",
  "aspen",
  "alder",
  "oak",
  "linden",
  "maple",
  "mixed_coniferous",
  "mixed_broadleaved",
  "mixed",
  "unknown",
] as const;

export type ForestSlug = (typeof FOREST_TEXTURE_SLUGS)[number];

// ─── Цвета ────────────────────────────────────────────────────────────────────
// Примерно соответствуют усреднённому цвету текстуры коры.
export const FOREST_COLORS: Record<ForestSlug, string> = {
  pine: "#8b5a34",
  spruce: "#3e2e1c",
  larch: "#9a4626",
  fir: "#56564e",
  cedar: "#5c3a24",
  // Бывший #eee8da — bark-кремовый — сливался с paper-фоном на низком
  // zoom. Сдвинут в olive/sage, остаётся «светлым» среди тёмных пород.
  birch: "#c8b890",
  aspen: "#9ea48c",
  alder: "#6c5844",
  oak: "#5a3c20",
  linden: "#a48c72",
  maple: "#7e5638",
  mixed_coniferous: "#463a22",
  mixed_broadleaved: "#a0845a",
  mixed: "#607244",
  unknown: "#9e9e9e",
};

/**
 * Opacity леса. 0.5 — чтобы под слоем читался basemap (рельеф/спутник/схема).
 * Tippecanoe pipeline (build_forest_tiles.sh) использует buffer=5px и
 * `--detect-shared-borders`, поэтому полос на стыках MVT-тайлов с opacity<1
 * почти не видно — старая константа 1.0 была компенсацией за buffer=128 в
 * предыдущем python-pipeline'е, теперь не нужна.
 */
const FOREST_OPACITY_EXPR = 0.5;

// Зазоры между смежными выделами на полупрозрачном (hybrid/satellite)
// басемапе: при `fill-antialias:false` MapLibre режет края полигонов
// хардкатом без блендинга, и из-за округления растеризации между двумя
// соседними полигонами остаётся ~1px полоса, через которую светит
// басемап (на спутнике — яркая диагональная сетка). Лечится двумя
// вещами сразу:
//   1. fill-antialias:true — край полигона антиалиасится, смежные
//      заливки сходятся без 1px-дыры.
//   2. fill-outline-color = ТА ЖЕ color-expr что fill-color — 1px
//      контур в собственном цвете полигона закрывает шов даже там,
//      где AA не дотянул. На стыке два контура накладываются (0.5+0.5)
//      → еле заметная тёмная нить вместо яркого зазора; на scheme
//      почти невидно.
const SPECIES_COLOR_EXPR = [
  "match",
  ["get", "dominant_species"],
  "pine", FOREST_COLORS.pine,
  "spruce", FOREST_COLORS.spruce,
  "larch", FOREST_COLORS.larch,
  "fir", FOREST_COLORS.fir,
  "cedar", FOREST_COLORS.cedar,
  "birch", FOREST_COLORS.birch,
  "aspen", FOREST_COLORS.aspen,
  "alder", FOREST_COLORS.alder,
  "oak", FOREST_COLORS.oak,
  "linden", FOREST_COLORS.linden,
  "maple", FOREST_COLORS.maple,
  "mixed_coniferous", FOREST_COLORS.mixed_coniferous,
  "mixed_broadleaved", FOREST_COLORS.mixed_broadleaved,
  "mixed", FOREST_COLORS.mixed,
  FOREST_COLORS.unknown,
] as const;

export const FOREST_LAYER_PAINT_COLOR = {
  "fill-color": SPECIES_COLOR_EXPR,
  "fill-opacity": FOREST_OPACITY_EXPR,
  "fill-outline-color": SPECIES_COLOR_EXPR,
  "fill-antialias": true,
} as const;

// ─── Режимы раскраски ─────────────────────────────────────────────────────────

export type ForestColorMode = "species" | "bonitet" | "age_group";

export const FOREST_COLOR_MODE_LABELS: Record<ForestColorMode, string> = {
  species:   "Порода",
  bonitet:   "Бонитет",
  age_group: "Возраст",
};

/** Бонитет 1 (лучший) → зелёный, 5 (худший) → красный */
const BONITET_COLOR_EXPR = [
  "match", ["get", "bonitet"],
  1, "#1b5e20",
  2, "#66bb6a",
  3, "#fdd835",
  4, "#ef6c00",
  5, "#b71c1c",
  "#9e9e9e",
] as const;

export const FOREST_LAYER_PAINT_BONITET = {
  "fill-color": BONITET_COLOR_EXPR,
  "fill-opacity": FOREST_OPACITY_EXPR,
  "fill-outline-color": BONITET_COLOR_EXPR,
  "fill-antialias": true,
} as const;

export const BONITET_LEGEND: Array<{ label: string; color: string }> = [
  { label: "I — высший",  color: "#1b5e20" },
  { label: "II",          color: "#66bb6a" },
  { label: "III",         color: "#fdd835" },
  { label: "IV",          color: "#ef6c00" },
  { label: "V — низший",  color: "#b71c1c" },
  { label: "Нет данных",  color: "#9e9e9e" },
];

/** Возрастные группы Rosleshoz */
const AGE_GROUP_COLOR_EXPR = [
  "match", ["get", "age_group"],
  "молодняки",        "#a5d6a7",
  "средневозрастные", "#43a047",
  "приспевающие",     "#2e7d32",
  "спелые",           "#795548",
  "перестойные",      "#4e342e",
  "#9e9e9e",
] as const;

export const FOREST_LAYER_PAINT_AGE_GROUP = {
  "fill-color": AGE_GROUP_COLOR_EXPR,
  "fill-opacity": FOREST_OPACITY_EXPR,
  "fill-outline-color": AGE_GROUP_COLOR_EXPR,
  "fill-antialias": true,
} as const;

export const AGE_GROUP_LEGEND: Array<{ label: string; color: string }> = [
  { label: "Молодняки",        color: "#a5d6a7" },
  { label: "Средневозрастные", color: "#43a047" },
  { label: "Приспевающие",     color: "#2e7d32" },
  { label: "Спелые",           color: "#795548" },
  { label: "Перестойные",      color: "#4e342e" },
  { label: "Нет данных",       color: "#9e9e9e" },
];
