/**
 * Словарь тэгов для user_spot — группированный по «деревья» / «грибы».
 *
 * Source-of-truth для:
 *   - SaveSpotModal multi-select picker'а
 *   - SpotDetailPage / CabinetSpotsPage отображения чипов
 *   - подсветки в иконке маркера на карте (TODO: Phase 5+)
 *
 * Slug'и совпадают со species-slug'ами `species_forest_affinity` где это
 * возможно (boletus-edulis, cantharellus-cibarius...) — чтобы в будущем
 * можно было автоматически сводить «места с белыми» с моделью прогноза.
 * Деревья — компактный список доминирующих пород ЛО, slug'и из
 * `geodata.dominant_species` enum'а.
 */

export interface SpotTag {
  slug: string;
  label: string;
}

export const TREE_TAGS: SpotTag[] = [
  { slug: "pine",       label: "Сосна" },
  { slug: "spruce",     label: "Ель" },
  { slug: "birch",      label: "Берёза" },
  { slug: "aspen",      label: "Осина" },
  { slug: "oak",        label: "Дуб" },
  { slug: "alder",      label: "Ольха" },
  { slug: "fir",        label: "Пихта" },
  { slug: "larch",      label: "Лиственница" },
  { slug: "linden",     label: "Липа" },
  { slug: "maple",      label: "Клён" },
  { slug: "willow",     label: "Ива" },
];

export const MUSHROOM_TAGS: SpotTag[] = [
  { slug: "boletus-edulis",          label: "Белый" },
  { slug: "leccinum-aurantiacum",    label: "Подосиновик" },
  { slug: "leccinum-scabrum",        label: "Подберёзовик" },
  { slug: "cantharellus-cibarius",   label: "Лисичка" },
  { slug: "xerocomus-subtomentosus", label: "Моховик" },
  { slug: "lactarius-deliciosus",    label: "Рыжик" },
  { slug: "lactarius-resimus",       label: "Груздь белый" },
  { slug: "lactarius-torminosus",    label: "Волнушка" },
  { slug: "armillaria-mellea",       label: "Опёнок" },
  { slug: "morchella-esculenta",     label: "Сморчок" },
  { slug: "russula-vesca",           label: "Сыроежка" },
  { slug: "pleurotus-ostreatus",     label: "Вёшенка" },
  { slug: "amanita-muscaria",        label: "Мухомор" },
];

export const BERRY_TAGS: SpotTag[] = [
  { slug: "blueberry",  label: "Черника" },
  { slug: "cloudberry", label: "Морошка" },
  { slug: "cranberry",  label: "Клюква" },
  { slug: "lingonberry", label: "Брусника" },
  { slug: "raspberry",  label: "Малина" },
];

export const ALL_TAGS: SpotTag[] = [
  ...TREE_TAGS,
  ...MUSHROOM_TAGS,
  ...BERRY_TAGS,
];

const LABEL_BY_SLUG = new Map(ALL_TAGS.map((t) => [t.slug, t.label]));

export function tagLabel(slug: string): string {
  return LABEL_BY_SLUG.get(slug) ?? slug;
}
