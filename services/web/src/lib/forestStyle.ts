/**
 * Цветовая палитра для forest-слоя.
 * Slug'и синхронизированы с geodata.types.ForestTypeSlug (Python).
 *
 * Тёмно-зелёные — хвойные. Салатовые — лиственные. Серые — смешанные/неизвестно.
 * Подбор палитры — ок для лёгкой версии, профессионально отполируем в phase 2.
 */
export const FOREST_COLORS = {
  pine: "#2d5a27",
  spruce: "#1e4a1e",
  larch: "#5c7a3a",
  fir: "#224d22",
  cedar: "#335533",

  birch: "#a8d96b",
  aspen: "#b8d874",
  alder: "#7fa65c",
  oak: "#6b9342",
  linden: "#96b964",
  maple: "#8fad55",

  mixed_coniferous: "#3d6d38",
  mixed_broadleaved: "#8db959",
  mixed: "#6a9146",

  unknown: "#4a8c4a",
} as const;

/**
 * Paint-спецификация MapLibre для forest-слоя.
 * Ожидает feature property 'dominant_species' — совпадает с тем, что мы
 * пишем в Mapbox Vector Tile при генерации тайлов (см. services/geodata).
 */
export const FOREST_LAYER_PAINT = {
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
  "fill-opacity": 0.7,
} as const;
