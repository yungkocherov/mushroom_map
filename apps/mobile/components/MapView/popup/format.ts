import type { Edibility } from "@mushroom-map/types";

export const FOREST_NAMES: Record<string, string> = {
  pine: "Сосновый лес", spruce: "Еловый лес", birch: "Берёзовый лес",
  aspen: "Осиновый лес", oak: "Дубовый лес", alder: "Ольховый лес",
  larch: "Лиственничный лес", linden: "Липовый лес", maple: "Кленовый лес",
  ash: "Ясеневый лес", fir: "Пихтовый лес", cedar: "Кедровый лес",
};
export const forestName = (slug?: string | null) =>
  (slug && FOREST_NAMES[slug]) || "Лес";

const ROMAN = ["", "I", "II", "III", "IV", "V"];
export const bonitetLabel = (b?: number | null) =>
  b != null && b >= 1 && b <= 5 ? `бонитет ${ROMAN[b]}` : null;

export const areaHa = (m2?: number | null) =>
  m2 != null ? `${(m2 / 10_000).toFixed(1)} га` : null;

export const EDIBILITY_COLOR: Record<Edibility, string> = {
  edible: "#2e7d32",
  conditionally_edible: "#e65100",
  inedible: "#757575",
  toxic: "#c62828",
  deadly: "#b71c1c",
};
export const edibilityColor = (e?: Edibility | null) =>
  (e && EDIBILITY_COLOR[e]) || "#333333";

export const MONTH_SHORT = [
  "", "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];
export const currentMonth = () => new Date().getMonth() + 1;

export const affinityPct = (a?: number | null) =>
  a != null ? `${Math.round(a * 100)}%` : null;

export const fmtDistance = (m: number) =>
  m < 1000 ? `${Math.round(m)} м` : `${(m / 1000).toFixed(1)} км`;

export const WATER_KIND_LABEL: Record<string, string> = {
  waterway: "ручей/река",
  water_zone: "водоохранная зона",
  wetland: "болото",
};
