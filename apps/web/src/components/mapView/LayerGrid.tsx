/**
 * LayerGrid — 7 чипов слоёв карты для SidebarDistrict (по spec'у
 * docs/redesign-2026-04.md, секция «Детальный режим района»).
 *
 * Layout:
 *  - desktop ('grid'): 2×4 grid, 7 заполнено + 1 пустой слот
 *  - mobile ('strip'): горизонтально-скроллируемая лента
 *
 * Слои:
 *   Прогноз     → useLayerVisibility.visible.forecastChoropleth
 *   Породы      → forest.visible + forestColorMode='species'
 *   Бонитет     → forest.visible + forestColorMode='bonitet'
 *   Возраст     → forest.visible + forestColorMode='age_group'
 *   Почва       → useLayerVisibility.visible.soil
 *   Рельеф      → useLayerVisibility.visible.hillshade
 *   Споты       → useLayerVisibility.visible.userSpots (auth-aware:
 *                 unauth — показываем «Войти» и линк на /auth)
 *
 * Single source of truth — useLayerVisibility store. MapView
 * подписывается на store отдельным controller-эффектом и применяет
 * изменения к MapLibre. Эту шину делит с forecastChoroplethLayer'ом
 * (Phase 2 commit `66d1ea8`).
 */
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

export function LayerGrid({ className, layout = "grid" }: LayerGridProps) {
  const visible = useLayerVisibility((s) => s.visible);
  const forestColorMode = useLayerVisibility((s) => s.forestColorMode);
  const setVisible = useLayerVisibility((s) => s.setVisible);
  const selectForestMode = useLayerVisibility((s) => s.selectForestMode);

  const auth = useAuth();
  const authStatus = auth.status;

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
          label: "Места",
          active: visible.userSpots,
          onClick: () => setVisible("userSpots", !visible.userSpots),
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
          hint: "Места",
          disabled: authStatus === "loading",
        };

  const chips: ChipDescriptor[] = [
    {
      key: "forecastChoropleth",
      label: "Прогноз",
      active: visible.forecastChoropleth,
      onClick: () =>
        setVisible("forecastChoropleth", !visible.forecastChoropleth),
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
      onClick: () => setVisible("soil", !visible.soil),
    },
    {
      key: "hillshade",
      label: "Рельеф",
      active: visible.hillshade,
      onClick: () => setVisible("hillshade", !visible.hillshade),
    },
    spotsChip,
  ];

  const containerClass = layout === "strip" ? styles.strip : styles.grid;

  return (
    <ul
      className={`${containerClass}${className ? ` ${className}` : ""}`}
      role="group"
      aria-label="Слои карты"
    >
      {chips.map((c) => (
        <li key={c.key} className={styles.item}>
          <ChipButton chip={c} />
        </li>
      ))}
    </ul>
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
