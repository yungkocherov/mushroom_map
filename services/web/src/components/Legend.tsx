import { useState } from "react";
import {
  FOREST_COLORS,
  ForestColorMode,
  BONITET_LEGEND,
  AGE_GROUP_LEGEND,
} from "../lib/forestStyle";
import { SOIL_LEGEND } from "../lib/soilStyle";
import { useIsMobile } from "../lib/useIsMobile";

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

// Что показывать в легенде. Если включена почва — её легенда важнее
// (перекрывает лес визуально), иначе — лес по выбранному режиму.
export type LegendMode = "soil" | "forest";

interface Props {
  mode: LegendMode;
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

export function Legend({ mode, colorMode }: Props) {
  const mobile = useIsMobile();
  // На мобильном легенда сворачивается в иконку, чтобы не закрывать карту.
  const [open, setOpen] = useState(!mobile);

  let title = "";
  let items: Array<{ label: string; color: string }> = [];

  if (mode === "soil") {
    title = "Почва";
    items = SOIL_LEGEND.map(({ label, color }) => ({ label, color }));
  } else if (colorMode === "species") {
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

  if (mobile && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          ...WRAP,
          minWidth: 0,
          padding: "8px 10px",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          color: "#333",
          border: "1px solid rgba(0,0,0,0.08)",
        }}
        title="Показать легенду"
      >
        {title} ▴
      </button>
    );
  }

  return (
    <div style={WRAP}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 4,
      }}>
        <span style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>
          {title}
        </span>
        {mobile && (
          <button
            onClick={() => setOpen(false)}
            style={{
              border: "none", background: "transparent", color: "#888",
              cursor: "pointer", fontSize: 14, padding: "0 0 0 8px",
            }}
            title="Свернуть"
          >
            ✕
          </button>
        )}
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
