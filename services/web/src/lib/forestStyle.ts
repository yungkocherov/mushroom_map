/**
 * Цвета и паттерны лесного слоя.
 *
 * Paint-режимы:
 *   1. `FOREST_LAYER_PAINT_PATTERN` — fill-pattern с процедурными текстурами
 *      коры (берёза = белая с штрихами, сосна = бороздки, дуб = кирпичная
 *      кладка и т.д.). Текстуры загружаются через map.addImage() из
 *      `/textures/forest/<slug>.png` на старте карты.
 *   2. `FOREST_LAYER_PAINT_COLOR` — обычная однотонная заливка. Используется
 *      как fallback если текстуры не загрузились.
 *
 * Slug'и синхронизированы с geodata.types.ForestTypeSlug (Python).
 */

// ─── slug'и пород для загрузки текстур ────────────────────────────────────────
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

/** MapLibre image-name для каждого slug'а. */
export const textureImageId = (slug: string): string => `forest-${slug}`;

// ─── Цвета (fallback без текстур) ────────────────────────────────────────────
// Примерно соответствуют усреднённому цвету текстуры коры.
export const FOREST_COLORS: Record<ForestSlug, string> = {
  pine: "#8b5a34",
  spruce: "#3e2e1c",
  larch: "#9a4626",
  fir: "#56564e",
  cedar: "#5c3a24",
  birch: "#eee8da",
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
 * Paint через fill-pattern. Требует чтобы `map.addImage("forest-<slug>", ...)`
 * был вызван ДО применения paint'а. Иначе MapLibre тихо не покажет слой.
 *
 * Opacity = 1.0 — принципиально. С opacity < 1 на стыках MVT-тайлов
 * перекрытие buffer-зон соседних тайлов рендерится дважды → заметные
 * более тёмные горизонтальные/вертикальные полосы. При opacity = 1
 * повторное рисование поверх себя невидимо.
 */
export const FOREST_LAYER_PAINT_PATTERN = {
  "fill-pattern": [
    "match",
    ["get", "dominant_species"],
    "pine", textureImageId("pine"),
    "spruce", textureImageId("spruce"),
    "larch", textureImageId("larch"),
    "fir", textureImageId("fir"),
    "cedar", textureImageId("cedar"),
    "birch", textureImageId("birch"),
    "aspen", textureImageId("aspen"),
    "alder", textureImageId("alder"),
    "oak", textureImageId("oak"),
    "linden", textureImageId("linden"),
    "maple", textureImageId("maple"),
    "mixed_coniferous", textureImageId("mixed_coniferous"),
    "mixed_broadleaved", textureImageId("mixed_broadleaved"),
    "mixed", textureImageId("mixed"),
    textureImageId("unknown"),
  ],
  "fill-opacity": 0.8,
  "fill-outline-color": "rgba(0,0,0,0)",
  "fill-antialias": true,
} as const;

/**
 * Paint через fill-color.
 * fill-opacity=0.8: надписи растровой подложки просвечивают сквозь лес.
 * fill-antialias=true: безопасно т.к. buffer=0 (нет перекрывающихся зон тайлов).
 */
export const FOREST_LAYER_PAINT_COLOR = {
  "fill-color": [
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
  ],
  "fill-opacity": 0.8,
  "fill-outline-color": "rgba(0,0,0,0)",
  // false устраняет "прожилки" между соседними полигонами: при opacity<1 и
  // antialias=true края каждого полигона слегка прозрачны → просвет на стыках.
  "fill-antialias": false,
} as const;

// Обратная совместимость — старое имя указывает на fallback-вариант
export const FOREST_LAYER_PAINT = FOREST_LAYER_PAINT_COLOR;
