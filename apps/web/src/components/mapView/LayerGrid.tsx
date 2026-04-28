/**
 * LayerGrid — все слои карты, объединённые в один UI после Phase 4.
 *
 * Layout:
 *  - desktop ('grid'): 2-колоночный grid из 7 primary chip'ов + кнопка
 *    «Ещё слои» с disclosure для 8 secondary chip'ов
 *  - mobile ('strip'): горизонтально-скроллируемая лента primary chip'ов;
 *    secondary недоступны — для них disclosure не имеет смысла на мобайле
 *
 * Primary chip'ы (7) — основной набор для грибника:
 *   Прогноз, Породы, Бонитет, Возраст, Почва, Рельеф, Сохранённые
 *
 * Secondary chip'ы (8) — служебные/расширенные:
 *   Водотоки, Болота, Водоохранные, ООПТ, Дороги, Вырубки, Защитные, Районы
 *
 * Single source of truth — useLayerVisibility store.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import {
  useLayerVisibility,
  type ForestColorMode,
} from "../../store/useLayerVisibility";
import styles from "./LayerGrid.module.css";

export interface LayerGridProps {
  className?: string;
  /** desktop: 'grid'; mobile: 'strip' (horizontal scroll). */
  layout?: "grid" | "strip";
  /** Когда true — оборачивается в `.floating` контейнер с position:absolute. Используется в MapView. */
  floating?: boolean;
}

interface ChipDescriptor {
  key: string;
  label: string;
  active: boolean;
  onClick?: () => void;
  href?: string;
  hint?: string;
  disabled?: boolean;
}

export function LayerGrid({ className, layout = "grid", floating = false }: LayerGridProps) {
  const visible = useLayerVisibility((s) => s.visible);
  const forestColorMode = useLayerVisibility((s) => s.forestColorMode);
  const setVisible = useLayerVisibility((s) => s.setVisible);
  const toggleVisible = useLayerVisibility((s) => s.toggleVisible);
  const selectForestMode = useLayerVisibility((s) => s.selectForestMode);

  const auth = useAuth();
  const authStatus = auth.status;

  const [secondaryOpen, setSecondaryOpen] = useState(false);

  const toggleForestMode = (mode: ForestColorMode) => {
    if (visible.forest && forestColorMode === mode) {
      // повторный клик по активному варианту forest — выключает слой
      setVisible("forest", false);
    } else {
      selectForestMode(mode);
    }
  };

  const isForestActive = (mode: ForestColorMode) =>
    visible.forest && forestColorMode === mode;

  const spotsChip: ChipDescriptor =
    authStatus === "authenticated"
      ? {
          key: "userSpots",
          label: "Сохранённые",
          active: visible.userSpots,
          onClick: () => toggleVisible("userSpots"),
        }
      : {
          key: "userSpots",
          label: "Войти",
          active: false,
          href: `/auth?next=${encodeURIComponent(
            typeof window !== "undefined"
              ? window.location.pathname + window.location.search
              : "/",
          )}`,
          hint: "Сохранённые",
          disabled: authStatus === "loading",
        };

  const primaryChips: ChipDescriptor[] = [
    {
      key: "forecastChoropleth",
      label: "Прогноз",
      active: visible.forecastChoropleth,
      onClick: () => toggleVisible("forecastChoropleth"),
    },
    {
      key: "forest-species",
      label: "Породы",
      active: isForestActive("species"),
      onClick: () => toggleForestMode("species"),
    },
    {
      key: "forest-bonitet",
      label: "Бонитет",
      active: isForestActive("bonitet"),
      onClick: () => toggleForestMode("bonitet"),
    },
    {
      key: "forest-age",
      label: "Возраст",
      active: isForestActive("age_group"),
      onClick: () => toggleForestMode("age_group"),
    },
    {
      key: "soil",
      label: "Почва",
      active: visible.soil,
      onClick: () => toggleVisible("soil"),
    },
    {
      key: "hillshade",
      label: "Рельеф",
      active: visible.hillshade,
      onClick: () => toggleVisible("hillshade"),
    },
    spotsChip,
  ];

  const secondaryChips: ChipDescriptor[] = [
    { key: "waterway", label: "Водотоки", active: visible.waterway, onClick: () => toggleVisible("waterway") },
    { key: "wetland",  label: "Болота",   active: visible.wetland,  onClick: () => toggleVisible("wetland") },
    { key: "water",    label: "Водоохранные", active: visible.water, onClick: () => toggleVisible("water") },
    { key: "oopt",     label: "ООПТ",     active: visible.oopt,     onClick: () => toggleVisible("oopt") },
    { key: "roads",    label: "Дороги",   active: visible.roads,    onClick: () => toggleVisible("roads") },
    { key: "felling",  label: "Вырубки",  active: visible.felling,  onClick: () => toggleVisible("felling") },
    { key: "protective", label: "Защитные", active: visible.protective, onClick: () => toggleVisible("protective") },
    { key: "districts", label: "Районы",  active: visible.districts, onClick: () => toggleVisible("districts") },
  ];

  const containerClass = layout === "strip" ? styles.strip : styles.grid;

  return (
    <div className={`${floating ? styles.floating : ""}${className ? ` ${className}` : ""}`.trim()}>
      <ul
        className={containerClass}
        role="group"
        aria-label="Слои карты"
      >
        {primaryChips.map((c) => (
          <li key={c.key} className={styles.item}>
            <ChipButton chip={c} />
          </li>
        ))}
      </ul>

      {layout === "grid" && (
        <>
          <button
            type="button"
            className={styles.secondaryToggle}
            onClick={() => setSecondaryOpen((o) => !o)}
            aria-expanded={secondaryOpen}
          >
            <span>Ещё слои</span>
            <span aria-hidden="true">{secondaryOpen ? "▴" : "▾"}</span>
          </button>
          {secondaryOpen && (
            <ul className={styles.secondaryGroup} role="group" aria-label="Дополнительные слои карты">
              {secondaryChips.map((c) => (
                <li key={c.key}>
                  <ChipButton chip={c} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function ChipButton({ chip }: { chip: ChipDescriptor }) {
  const className = `${styles.chip}${chip.active ? ` ${styles.chipActive}` : ""}${
    chip.disabled ? ` ${styles.chipDisabled}` : ""
  }`;

  const inner = (
    <>
      <span className={styles.label}>{chip.label}</span>
      {chip.hint ? <span className={styles.subLabel}>{chip.hint}</span> : null}
    </>
  );

  if (chip.href) {
    return (
      <Link
        to={chip.href}
        className={className}
        aria-disabled={chip.disabled || undefined}
        tabIndex={chip.disabled ? -1 : undefined}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={chip.onClick}
      aria-pressed={chip.active}
      disabled={chip.disabled}
    >
      {inner}
    </button>
  );
}
