/**
 * Legend — список свотчей для активного слоя (порода / бонитет /
 * возраст / почва).
 *
 * V4.2 (redesign-2026-05-11): свотчи кликабельны и работают как фильтр
 * — нажатие на «Сосна» в режиме «Породы» оставляет на карте только
 * полигоны с dominant_species=pine. Многократный клик добавляет
 * виды в OR-фильтр. Повторный клик по выбранному — снимает.
 * Кнопка «Сбросить» появляется внизу когда фильтр активен.
 *
 * Filter живёт в store как `legendFilter: Array<string|number>`.
 * Map-controller (`useMapLayers`) переводит его в MapLibre setFilter
 * по `forestColorMode`-specific property name (см. buildForestFilter).
 *
 * Soil legend пока некликабельна — soil-слой имеет собственное API
 * раскраски, легенда лишь отображает.
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

interface LegendItem {
  label: string;
  color: string;
  /** Значение для legendFilter (slug/number/age-string). Undefined =
   *  свотч некликабельный (например «Нет данных»). */
  filterValue?: string | number;
}

interface LegendProps {
  variant?: "floating" | "inline";
}

export function Legend({ variant = "floating" }: LegendProps = {}) {
  const colorMode = useLayerVisibility((s) => s.forestColorMode);
  const forestLoaded = useLayerVisibility((s) => s.loaded.forest);
  const forestVisible = useLayerVisibility((s) => s.visible.forest);
  const soilLoaded = useLayerVisibility((s) => s.loaded.soil);
  const soilVisible = useLayerVisibility((s) => s.visible.soil);
  const legendFilter = useLayerVisibility((s) => s.legendFilter);
  const toggleLegendFilter = useLayerVisibility((s) => s.toggleLegendFilter);
  const clearLegendFilter = useLayerVisibility((s) => s.clearLegendFilter);
  const mobile = useIsMobile();
  const [open, setOpen] = useState(!mobile || variant === "inline");

  const forestActive = forestLoaded && forestVisible;
  const soilActive = soilLoaded && soilVisible;
  if (!forestActive && !soilActive) return null;
  const mode: LegendMode = soilActive ? "soil" : "forest";

  let title = "";
  let items: LegendItem[] = [];
  let filterable = false;

  if (mode === "soil") {
    title = "Почва";
    items = SOIL_LEGEND.map(({ label, color }) => ({ label, color }));
    filterable = false;
  } else if (colorMode === "species") {
    title = "Порода";
    items = SPECIES_LEGEND.map(({ slug, label }) => ({
      label,
      color: FOREST_COLORS[slug as keyof typeof FOREST_COLORS] ?? "#9e9e9e",
      filterValue: slug,
    }));
    filterable = true;
  } else if (colorMode === "bonitet") {
    title = "Бонитет";
    // BONITET_LEGEND имеет 6 entries (I-V + «Нет данных»). Filter-value
    // = индекс+1 (1..5); последний без filterValue.
    items = BONITET_LEGEND.map((b, i) => ({
      label: b.label,
      color: b.color,
      filterValue: i < 5 ? i + 1 : undefined,
    }));
    filterable = true;
  } else {
    title = "Возраст";
    // AGE_GROUP_LEGEND метки совпадают с property values в нижнем регистре.
    const SLUGS = ["молодняки", "средневозрастные", "приспевающие", "спелые", "перестойные"];
    items = AGE_GROUP_LEGEND.map((a, i) => ({
      label: a.label,
      color: a.color,
      filterValue: i < SLUGS.length ? SLUGS[i] : undefined,
    }));
    filterable = true;
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
  const hasFilter = (legendFilter?.length ?? 0) > 0;

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
      {items.map(({ label, color, filterValue }) => {
        const isActive =
          hasFilter && filterValue !== undefined && legendFilter!.includes(filterValue);
        // Если фильтр активен и эта строка НЕ в фильтре — приглушаем.
        const isDimmed = hasFilter && !isActive;
        const canFilter = filterable && filterValue !== undefined;
        const className = [
          styles.row,
          canFilter ? styles.rowClickable : "",
          isActive ? styles.rowActive : "",
          isDimmed ? styles.rowDimmed : "",
        ].filter(Boolean).join(" ");

        if (!canFilter) {
          return (
            <div key={label} className={className}>
              <span className={styles.swatch} style={{ background: color }} />
              <span>{label}</span>
            </div>
          );
        }
        return (
          <button
            key={label}
            type="button"
            className={className}
            onClick={() => toggleLegendFilter(filterValue!)}
            aria-pressed={isActive}
            title={isActive ? "Снять фильтр" : `Только: ${label}`}
          >
            <span className={styles.swatch} style={{ background: color }} />
            <span>{label}</span>
          </button>
        );
      })}
      {hasFilter && (
        <button
          type="button"
          className={styles.clearBtn}
          onClick={() => clearLegendFilter()}
        >
          Снять фильтр
        </button>
      )}
    </aside>
  );
}
