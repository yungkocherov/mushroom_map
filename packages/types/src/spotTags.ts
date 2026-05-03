/**
 * Словарь тэгов для user_spot — группированный по «деревья» / «грибы» /
 * «ягоды». Source-of-truth для:
 *   - web: SaveSpotModal, SpotDetailPage, CabinetSpotsPage
 *   - mobile: SaveSpotSheet, SpotDetailPage
 *   - бэкенд использует только slug'и (no validation на сервере, словарь
 *     живёт во фронтах)
 *
 * Slug'и совпадают со species-slug'ами `species_forest_affinity` где это
 * возможно (boletus-edulis, cantharellus-cibarius...) — чтобы в будущем
 * можно было автоматически сводить «места с белыми» с моделью прогноза.
 * Деревья — компактный список доминирующих пород ЛО, slug'и из
 * `geodata.dominant_species` enum'а.
 *
 * `icon` — emoji для quick visual recognition. Без отдельных SVG-pack'ов:
 * unicode emoji уже доступны на любом современном Android/iOS, занимают
 * 0 байт в bundle. Семантически это всё ещё «иллюстрация», для grass-roots
 * UI этого хватает; кастомные SVG-иконки имеет смысл вводить только
 * когда появится design-pass.
 */

export interface SpotTag {
  slug: string;
  label: string;
  icon: string;
}

export const TREE_TAGS: SpotTag[] = [
  { slug: "pine",   label: "Сосна",       icon: "🌲" },
  { slug: "spruce", label: "Ель",         icon: "🎄" },
  { slug: "birch",  label: "Берёза",      icon: "🪵" },
  { slug: "aspen",  label: "Осина",       icon: "🍂" },
  { slug: "oak",    label: "Дуб",         icon: "🌳" },
  { slug: "alder",  label: "Ольха",       icon: "🌿" },
  { slug: "fir",    label: "Пихта",       icon: "🌲" },
  { slug: "larch",  label: "Лиственница", icon: "🌲" },
  { slug: "linden", label: "Липа",        icon: "🌳" },
  { slug: "maple",  label: "Клён",        icon: "🍁" },
  { slug: "willow", label: "Ива",         icon: "🌿" },
];

export const MUSHROOM_TAGS: SpotTag[] = [
  { slug: "boletus-edulis",          label: "Белый",        icon: "🍄" },
  { slug: "leccinum-aurantiacum",    label: "Подосиновик",  icon: "🍄" },
  { slug: "leccinum-scabrum",        label: "Подберёзовик", icon: "🍄" },
  { slug: "cantharellus-cibarius",   label: "Лисичка",      icon: "🌽" },
  { slug: "xerocomus-subtomentosus", label: "Моховик",      icon: "🍄" },
  { slug: "lactarius-deliciosus",    label: "Рыжик",        icon: "🍄" },
  { slug: "lactarius-resimus",       label: "Груздь белый", icon: "🍄" },
  { slug: "lactarius-torminosus",    label: "Волнушка",     icon: "🍄" },
  { slug: "armillaria-mellea",       label: "Опёнок",       icon: "🍄" },
  { slug: "morchella-esculenta",     label: "Сморчок",      icon: "🌱" },
  { slug: "russula-vesca",           label: "Сыроежка",     icon: "🍄" },
  { slug: "pleurotus-ostreatus",     label: "Вёшенка",      icon: "🍄" },
  { slug: "amanita-muscaria",        label: "Мухомор",      icon: "🍄" },
];

export const BERRY_TAGS: SpotTag[] = [
  { slug: "blueberry",   label: "Черника",  icon: "🫐" },
  { slug: "cloudberry",  label: "Морошка",  icon: "🟠" },
  { slug: "cranberry",   label: "Клюква",   icon: "🔴" },
  { slug: "lingonberry", label: "Брусника", icon: "🍒" },
  { slug: "raspberry",   label: "Малина",   icon: "🍇" },
];

export const ALL_TAGS: SpotTag[] = [
  ...TREE_TAGS,
  ...MUSHROOM_TAGS,
  ...BERRY_TAGS,
];

const LABEL_BY_SLUG = new Map(ALL_TAGS.map((t) => [t.slug, t.label]));
const ICON_BY_SLUG = new Map(ALL_TAGS.map((t) => [t.slug, t.icon]));

export function tagLabel(slug: string): string {
  return LABEL_BY_SLUG.get(slug) ?? slug;
}

export function tagIcon(slug: string): string {
  return ICON_BY_SLUG.get(slug) ?? "·";
}
