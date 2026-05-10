/**
 * Legend — bottom-left floating card отображающий список свотчей для
 * активного слоя (порода / бонитет / возраст / почва).
 *
 * После Phase W4/V2 (redesign-2026-05) переписан на cream-card стиль
 * c CSS Modules — гармонизирует с LayerGrid и MapForecastPanel.
 */

import { useState } from "react";
import {
  FOREST_COLORS,
  BONITET_LEGEND,
  AGE_GROUP_LEGEND,
} from "../lib/forestStyle";
import { SOIL_LEGEND } from "../lib/soilStyle";
import { useIsMobile } from "../lib/useIsMobile";
import { useLayerVisibility } from "../store/useLayerVisibility";
import styles from "./Legend.module.css";

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
type LegendMode = "soil" | "forest";

export function Legend() {
  const colorMode = useLayerVisibility((s) => s.forestColorMode);
  const forestLoaded = useLayerVisibility((s) => s.loaded.forest);
  const forestVisible = useLayerVisibility((s) => s.visible.forest);
  const soilLoaded = useLayerVisibility((s) => s.loaded.soil);
  const soilVisible = useLayerVisibility((s) => s.visible.soil);
  const mobile = useIsMobile();
  // На мобильном легенда сворачивается в кнопку-чип, чтобы не закрывать карту.
  const [open, setOpen] = useState(!mobile);

  // Легенда рисуется только когда соответствующий слой и загружен, и
  // видим. Раньше gate был только на `loaded` — после toggle off forest
  // легенда оставалась висеть (см. user feedback fix 8).
  const forestActive = forestLoaded && forestVisible;
  const soilActive = soilLoaded && soilVisible;
  if (!forestActive && !soilActive) return null;
  const mode: LegendMode = soilActive ? "soil" : "forest";

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
        type="button"
        onClick={() => setOpen(true)}
        className={`${styles.wrap} ${styles.collapsed}`}
        title="Показать легенду"
      >
        {title} ▴
      </button>
    );
  }

  return (
    <aside className={styles.wrap} aria-label={`Легенда: ${title}`}>
      <div className={styles.head}>
        <span className={styles.eyebrow}>{title}</span>
        {mobile && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={styles.collapseBtn}
            title="Свернуть"
          >
            ✕
          </button>
        )}
      </div>
      {items.map(({ label, color }) => (
        <div key={label} className={styles.row}>
          <span className={styles.swatch} style={{ background: color }} />
          <span>{label}</span>
        </div>
      ))}
    </aside>
  );
}
