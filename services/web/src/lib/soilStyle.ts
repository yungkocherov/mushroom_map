/**
 * Группировка soil0_id из Докучаевского ин-та (1:2.5M) в 8 кластеров
 * по грибной экологии. В ЛО+Карелии реально встречается 22 soil0_id,
 * прямое окрашивание по каждому визуально неразличимо → группируем.
 *
 * Порядок колонок легенды — от самых продуктивных для белых/груздей
 * к болотным/непочвенным.
 */

export type SoilGroup =
  | "rich"          // дерново-карбонатные + буро-таёжные — богатые, для белых/груздей
  | "sandy"         // подзолы иллювиально-железистые — песчаные сосновые боры
  | "sod_podzolic"  // дерново-подзолистые — основной фон таёжной ЛО
  | "podzolic"      // подзолистые без разделения — чуть беднее
  | "moist_podzol"  // глеевые / глееватые / торфянисто-подзолистые — влажные
  | "peat_bog"      // торфяные болотные — клюква, моршка
  | "alluvial"      // пойменные — у рек
  | "water"         // «Вода» (soil_id=307)
  | "unknown";

// Прямой маппинг soil0_id -> группа. Поддерживать его проще, чем regex по descript.
export const SOIL0_TO_GROUP: Record<number, SoilGroup> = {
  307: "water",
  187: "alluvial",
  69:  "rich",   48: "rich",   83: "rich",
  50:  "sandy",  56: "sandy",  58: "sandy",
  38:  "sod_podzolic",  46: "sod_podzolic",
  29:  "podzolic",      33: "podzolic",  60: "podzolic",
  19:  "moist_podzol",  20: "moist_podzol",
  36:  "moist_podzol",  54: "moist_podzol",  62: "moist_podzol",
  164: "peat_bog", 165: "peat_bog", 166: "peat_bog", 170: "peat_bog",
};

export const SOIL_GROUP_COLOR: Record<SoilGroup, string> = {
  rich:         "#b97a56",
  sandy:        "#e8c872",
  sod_podzolic: "#c9a96e",
  podzolic:     "#dcc9a0",
  moist_podzol: "#7d8ba3",
  peat_bog:     "#5d4037",
  alluvial:     "#8fbc5c",
  water:        "#b0cde5",
  unknown:      "#bdbdbd",
};

export const SOIL_GROUP_LABEL: Record<SoilGroup, string> = {
  rich:         "Богатые (дерново-карбонатные, буроземы)",
  sandy:        "Песчаные (подзолы иллювиально-железистые)",
  sod_podzolic: "Дерново-подзолистые",
  podzolic:     "Подзолистые",
  moist_podzol: "Влажные (глеевые, болотно-подзолистые)",
  peat_bog:     "Торфяные болотные",
  alluvial:     "Пойменные",
  water:        "Вода",
  unknown:      "Прочие",
};

// MapLibre match-expression: soil0_id -> цвет. Используется в paint.fill-color.
export function buildSoilFillColorExpression(): unknown[] {
  const pairs: unknown[] = [];
  for (const [id, group] of Object.entries(SOIL0_TO_GROUP)) {
    pairs.push(Number(id), SOIL_GROUP_COLOR[group]);
  }
  return ["match", ["get", "soil0_id"], ...pairs, SOIL_GROUP_COLOR.unknown];
}

// Легенда в порядке «от грибника-ориентира к прочему».
export const SOIL_LEGEND: Array<{ group: SoilGroup; label: string; color: string }> = [
  "rich", "sandy", "sod_podzolic", "podzolic",
  "moist_podzol", "peat_bog", "alluvial", "water",
].map((g) => ({
  group: g as SoilGroup,
  label: SOIL_GROUP_LABEL[g as SoilGroup],
  color: SOIL_GROUP_COLOR[g as SoilGroup],
}));
