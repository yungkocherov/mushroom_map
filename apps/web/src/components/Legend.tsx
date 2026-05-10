/**
 * Legend — список свотчей для активного слоя (порода / бонитет /
 * возраст / почва).
 *
 * После Phase V3 (redesign-2026-05) переключаемый между двумя режимами:
 *
 *  - `floating` (default) — отдельная bottom-left card на /map (legacy).
 *    Используется когда LayerGrid не показывает легенду inline.
 *  - `inline` — рендерится внутри LayerGrid floating-card как нижняя
 *    секция «легенда · {слой}». Гармонизирует с дизайн-эталоном
 *    d1v2.jsx, где подложка/слои/легенда — одна карточка.
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

type LegendMode = "soil" | "forest";

interface LegendProps {
  /**
   * 'floating' (default) — bottom-left card с тенью.
   * 'inline'  — без position/shadow, для встраивания в LayerGrid.
   */
  variant?: "floating" | "inline";
}

export function Legend({ variant = "floating" }: LegendProps = {}) {
  const colorMode = useLayerVisibility((s) => s.forestColorMode);
  const forestLoaded = useLayerVisibility((s) => s.loaded.forest);
  const forestVisible = useLayerVisibility((s) => s.visible.forest);
  const soilLoaded = useLayerVisibility((s) => s.loaded.soil);
  const soilVisible = useLayerVisibility((s) => s.visible.soil);
  const mobile = useIsMobile();
  // На мобильном legend сворачивается в чип только в floating-режиме;
  // inline всегда раскрыт, потому что родитель — collapsible LayerGrid.
  const [open, setOpen] = useState(!mobile || variant === "inline");

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

  if (variant === "floating" && mobile && !open) {
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

  const wrapClass = variant === "inline" ? styles.inline : styles.wrap;

  return (
    <aside className={wrapClass} aria-label={`Легенда: ${title}`}>
      <div className={styles.head}>
        <span className={styles.eyebrow}>{title}</span>
        {variant === "floating" && mobile && (
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
