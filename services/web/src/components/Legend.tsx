import { FOREST_COLORS } from "../lib/forestStyle";

const LEGEND_ITEMS: Array<{ slug: keyof typeof FOREST_COLORS; label: string }> = [
  { slug: "pine", label: "Сосна" },
  { slug: "spruce", label: "Ель" },
  { slug: "birch", label: "Берёза" },
  { slug: "aspen", label: "Осина" },
  { slug: "oak", label: "Дуб" },
  { slug: "mixed_coniferous", label: "Смешанный хвойный" },
  { slug: "mixed_broadleaved", label: "Смешанный лиственный" },
  { slug: "mixed", label: "Смешанный" },
  { slug: "unknown", label: "Неизвестно" },
];

export function Legend() {
  return (
    <div className="legend">
      <h3 className="legend__title">Тип леса</h3>
      <ul className="legend__list">
        {LEGEND_ITEMS.map(({ slug, label }) => (
          <li key={slug} className="legend__item">
            <span className="legend__swatch" style={{ background: FOREST_COLORS[slug] }} />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}
