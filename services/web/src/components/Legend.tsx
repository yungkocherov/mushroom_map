import {
  FOREST_COLORS,
  ForestColorMode,
  BONITET_LEGEND,
  AGE_GROUP_LEGEND,
} from "../lib/forestStyle";

const SPECIES_LEGEND = [
  { slug: "pine",             label: "Сосна" },
  { slug: "spruce",           label: "Ель" },
  { slug: "birch",            label: "Берёза" },
  { slug: "aspen",            label: "Осина" },
  { slug: "alder",            label: "Ольха" },
  { slug: "oak",              label: "Дуб" },
  { slug: "mixed_coniferous", label: "Смеш. хвойный" },
  { slug: "mixed_broadleaved",label: "Смеш. лиственный" },
  { slug: "mixed",            label: "Смешанный" },
  { slug: "unknown",          label: "Неизвестно" },
] as const;

interface Props {
  colorMode: ForestColorMode;
}

const WRAP: React.CSSProperties = {
  position: "absolute",
  bottom: 28,
  left: 12,
  zIndex: 10,
  background: "rgba(255,255,255,0.92)",
  backdropFilter: "blur(6px)",
  borderRadius: 8,
  padding: "8px 10px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontFamily: "system-ui, sans-serif",
  fontSize: 11,
  minWidth: 140,
};

const ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "2px 0",
};

const SWATCH = (color: string): React.CSSProperties => ({
  width: 12,
  height: 12,
  borderRadius: 2,
  background: color,
  flexShrink: 0,
});

export function Legend({ colorMode }: Props) {
  let title = "";
  let items: Array<{ label: string; color: string }> = [];

  if (colorMode === "species") {
    title = "Порода";
    items = SPECIES_LEGEND.map(({ slug, label }) => ({
      label,
      color: FOREST_COLORS[slug as keyof typeof FOREST_COLORS] ?? "#9e9e9e",
    }));
  } else if (colorMode === "bonitet") {
    title = "Бонитет";
    items = BONITET_LEGEND;
  } else {
    title = "Возраст";
    items = AGE_GROUP_LEGEND;
  }

  return (
    <div style={WRAP}>
      <div style={{ fontSize: 10, color: "#888", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {title}
      </div>
      {items.map(({ label, color }) => (
        <div key={label} style={ROW}>
          <span style={SWATCH(color)} />
          <span style={{ color: "#333" }}>{label}</span>
        </div>
      ))}
    </div>
  );
}
