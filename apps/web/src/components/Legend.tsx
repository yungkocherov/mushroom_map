/**
 * Legend — список свотчей для активного слоя.
 *
 * V4.3 (redesign-2026-05-11): данные тянутся из `/api/forest/legend`
 * вместо хардкоженного SPECIES_LEGEND. Backend агрегирует реальные
 * forest_unified строки и отдаёт `{species, bonitet, age_group}` с
 * counts. Это гарантирует синхрон легенды с тем, что юзер реально
 * увидит в попапе клика по карте: если в БД есть «клён» — он будет
 * в легенде. Запрашивается один раз за сессию (in-memory cache).
 *
 * V4.2 — свотчи кликабельны, действуют как filter (toggle):
 * `legendFilter` store → `useMapLayers.buildForestFilter` → MapLibre
 * setFilter на forest-fill по `forestColorMode`-зависимому property.
 *
 * Soil legend пока некликабельна — soil-слой имеет собственное API
 * раскраски, легенда лишь отображает.
 */

import { useEffect, useState } from "react";
import {
  FOREST_COLORS,
  BONITET_LEGEND,
  AGE_GROUP_LEGEND,
  type ForestSlug,
} from "../lib/forestStyle";
import { SOIL_LEGEND } from "../lib/soilStyle";
import { useIsMobile } from "../lib/useIsMobile";
import { useLayerVisibility } from "../store/useLayerVisibility";
import { fetchForestLegend, type ForestLegendResponse } from "@mushroom-map/api-client";
import styles from "./Legend.module.css";

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

// Module-level cache — одна fetch на сессию. Если бэкенд обновит данные
// между сессиями — после reload подтянется свежее.
let _legendCache: ForestLegendResponse | null = null;
let _legendPromise: Promise<ForestLegendResponse> | null = null;

function getLegendData(): Promise<ForestLegendResponse> {
  if (_legendCache) return Promise.resolve(_legendCache);
  if (_legendPromise) return _legendPromise;
  _legendPromise = fetchForestLegend()
    .then((d) => {
      _legendCache = d;
      return d;
    })
    .catch((e) => {
      _legendPromise = null; // позволить retry на следующий render
      throw e;
    });
  return _legendPromise;
}

// Цвет для возрастной группы / бонитета — берётся из захардкоженных
// AGE_GROUP_LEGEND / BONITET_LEGEND. Цветовая шкала намеренно не из
// БД — она определяется UX, не данными.
const AGE_COLOR_BY_VALUE: Record<string, string> = Object.fromEntries(
  ["молодняки", "средневозрастные", "приспевающие", "спелые", "перестойные"].map(
    (v, i) => [v, AGE_GROUP_LEGEND[i]?.color ?? "#9e9e9e"],
  ),
);

const BONITET_COLOR_BY_VALUE: Record<number, string> = Object.fromEntries(
  [1, 2, 3, 4, 5].map((v, i) => [v, BONITET_LEGEND[i]?.color ?? "#9e9e9e"]),
);

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

  // Async fetch легенды — only when forest active. Cached in-module.
  const [data, setData] = useState<ForestLegendResponse | null>(_legendCache);
  useEffect(() => {
    if (data || !(forestLoaded && forestVisible)) return;
    let cancelled = false;
    getLegendData()
      .then((d) => !cancelled && setData(d))
      .catch(() => {}); // тихо — fall-back на хардкод-метки ниже
    return () => {
      cancelled = true;
    };
  }, [data, forestLoaded, forestVisible]);

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
    // Если данные ещё не пришли — пустой список (Legend re-render'ится
    // после fetch). После пришли — итерируем по DB-distribution.
    items = (data?.species ?? []).map((s) => ({
      label: s.label,
      color: FOREST_COLORS[s.slug as ForestSlug] ?? "#9e9e9e",
      filterValue: s.slug,
    }));
    filterable = true;
  } else if (colorMode === "bonitet") {
    title = "Бонитет";
    items = (data?.bonitet ?? []).map((b) => ({
      label: b.label,
      color: BONITET_COLOR_BY_VALUE[b.value] ?? "#9e9e9e",
      filterValue: b.value,
    }));
    filterable = true;
  } else {
    title = "Возраст";
    items = (data?.age_group ?? []).map((a) => ({
      label: a.label,
      color: AGE_COLOR_BY_VALUE[a.value] ?? "#9e9e9e",
      filterValue: a.value,
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
      {items.length === 0 && mode === "forest" && (
        <p className={styles.emptyHint}>Загружаем&hellip;</p>
      )}
      {items.map(({ label, color, filterValue }) => {
        const isActive =
          hasFilter && filterValue !== undefined && legendFilter!.includes(filterValue);
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
