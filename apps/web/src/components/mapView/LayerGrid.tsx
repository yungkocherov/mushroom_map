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
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Map } from "maplibre-gl";
import { useAuth } from "../../auth/useAuth";
import {
  useLayerVisibility,
  type ForestColorMode,
} from "../../store/useLayerVisibility";
import { useMapShare } from "./hooks/useMapShare";
import { BaseMapPicker } from "./BaseMapPicker";
import { Legend } from "../Legend";
import { LAYER_DESCRIPTIONS, getForestDescription } from "./layerDescriptions";
import { track } from "../../lib/track";
import styles from "./LayerGrid.module.css";

export interface LayerGridProps {
  className?: string;
  /** desktop: 'grid'; mobile: 'strip' (horizontal scroll). */
  layout?: "grid" | "strip";
  /** Когда true — оборачивается в `.floating` контейнер с position:absolute. Используется в MapView. */
  floating?: boolean;
  /** Когда true (вместе с floating) — рисует футер с кнопками «Сбросить» / «Поделиться». */
  showFooter?: boolean;
  /** Когда true — рендерит BaseMapPicker (variant=inline) сверху перед чипами слоёв. */
  showBasemap?: boolean;
  /** Нужен для useMapShare: «Поделиться» читает center/zoom. */
  mapRef?: React.MutableRefObject<Map | null>;
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

export function LayerGrid({
  className,
  layout = "grid",
  floating = false,
  showFooter = false,
  showBasemap = false,
  mapRef,
}: LayerGridProps) {
  const visible = useLayerVisibility((s) => s.visible);
  const forestColorMode = useLayerVisibility((s) => s.forestColorMode);
  const setVisible = useLayerVisibility((s) => s.setVisible);
  const toggleVisible = useLayerVisibility((s) => s.toggleVisible);
  const selectForestMode = useLayerVisibility((s) => s.selectForestMode);
  const resetAllVisibility = useLayerVisibility((s) => s.resetAllVisibility);

  // useMapShare нужен только когда показываем footer и есть mapRef.
  // Хук безопасно вызывать всегда (он просто возвращает no-op callback,
  // когда ref'у нечего читать), это удобнее чем условный вызов.
  const noopRef = useRef<Map | null>(null);
  const onShare = useMapShare(mapRef ?? noopRef);

  const auth = useAuth();
  const authStatus = auth.status;

  const [secondaryOpen, setSecondaryOpen] = useState(false);

  const toggleForestMode = (mode: ForestColorMode) => {
    if (visible.forest && forestColorMode === mode) {
      // повторный клик по активному варианту forest — выключает слой
      setVisible("forest", false);
      track("layer.toggle", { layer: `forest:${mode}`, visible: false });
    } else {
      selectForestMode(mode);
      track("layer.toggle", { layer: `forest:${mode}`, visible: true });
    }
  };

  // Обёртка вокруг toggleVisible: фиксирует событие в Umami ДО переключения,
  // когда `visible[key]` ещё содержит pre-toggle значение (поэтому новое =
  // !current). track() безопасен — no-op если Umami не загрузился.
  const trackedToggle = (key: keyof typeof visible) => {
    track("layer.toggle", { layer: key, visible: !visible[key] });
    toggleVisible(key);
  };

  // V4.5: hint (title attribute) = body description из layerDescriptions.
  // Native HTML tooltip — простой и доступный, не требует library.
  const primaryChips: ChipDescriptor[] = [
    {
      key: "forecastChoropleth",
      label: "Прогноз",
      hint: LAYER_DESCRIPTIONS.forecastChoropleth.body,
      active: visible.forecastChoropleth,
      onClick: () => trackedToggle("forecastChoropleth"),
    },
    {
      key: "waterway",
      label: "Водотоки",
      hint: LAYER_DESCRIPTIONS.waterway.body,
      active: visible.waterway,
      onClick: () => trackedToggle("waterway"),
    },
    {
      key: "wetland",
      label: "Болота",
      hint: LAYER_DESCRIPTIONS.wetland.body,
      active: visible.wetland,
      onClick: () => trackedToggle("wetland"),
    },
  ];

  // 2026-04-29: «Сохранённые» только для залогиненных. Когда unauth — chip
  // не рендерим вообще, чтобы не дублировать «Войти» из header'а.
  if (authStatus === "authenticated") {
    primaryChips.push({
      key: "userSpots",
      label: "Сохранённые",
      hint: LAYER_DESCRIPTIONS.userSpots.body,
      active: visible.userSpots,
      onClick: () => trackedToggle("userSpots"),
    });
  }

  const secondaryChips: ChipDescriptor[] = [
    { key: "water",    label: "Водоохранные", hint: LAYER_DESCRIPTIONS.water.body, active: visible.water, onClick: () => trackedToggle("water") },
    { key: "soil",     label: "Почва",    hint: LAYER_DESCRIPTIONS.soil.body, active: visible.soil,     onClick: () => trackedToggle("soil") },
    { key: "hillshade", label: "Рельеф",  hint: LAYER_DESCRIPTIONS.hillshade.body, active: visible.hillshade, onClick: () => trackedToggle("hillshade") },
    { key: "oopt",     label: "ООПТ",     hint: LAYER_DESCRIPTIONS.oopt.body, active: visible.oopt,     onClick: () => trackedToggle("oopt") },
    { key: "roads",    label: "Дороги",   hint: LAYER_DESCRIPTIONS.roads.body, active: visible.roads,    onClick: () => trackedToggle("roads") },
    { key: "felling",  label: "Вырубки",  hint: LAYER_DESCRIPTIONS.felling.body, active: visible.felling,  onClick: () => trackedToggle("felling") },
    { key: "protective", label: "Защитные", hint: LAYER_DESCRIPTIONS.protective.body, active: visible.protective, onClick: () => trackedToggle("protective") },
    { key: "districts", label: "Районы",  hint: LAYER_DESCRIPTIONS.districts.body, active: visible.districts, onClick: () => trackedToggle("districts") },
  ];

  const containerClass = layout === "strip" ? styles.strip : styles.grid;

  return (
    <div className={`${floating ? styles.floating : ""}${className ? ` ${className}` : ""}`.trim()}>
      {showBasemap && <BaseMapPicker variant="inline" />}
      <ul
        className={containerClass}
        role="group"
        aria-label="Слои карты"
      >
        <li className={`${styles.item} ${styles.itemFull}`}>
          <ForestCard
            forestVisible={visible.forest}
            forestColorMode={forestColorMode}
            onToggleMode={toggleForestMode}
          />
        </li>
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

      {showFooter && floating && (
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.footerBtn}
            onClick={resetAllVisibility}
            title="Выключить все слои"
          >
            Сбросить
          </button>
          <button
            type="button"
            className={styles.footerBtn}
            onClick={onShare}
            title="Скопировать ссылку на текущий вид карты"
          >
            Поделиться
          </button>
        </div>
      )}

      {floating && <Legend variant="inline" />}
    </div>
  );
}

function ChipButton({ chip }: { chip: ChipDescriptor }) {
  const className = `${styles.chip}${chip.active ? ` ${styles.chipActive}` : ""}${
    chip.disabled ? ` ${styles.chipDisabled}` : ""
  }`;

  // V4.5: hint теперь рендерится через native `title` (HTML tooltip)
  // вместо inline subtext. Юзер пожаловался что не понятно что значит
  // «Бонитет» / «ООПТ» — короткое описание появляется при hover'е без
  // визуального шума в самом чипе.
  const titleAttr = chip.hint || undefined;

  const inner = <span className={styles.label}>{chip.label}</span>;

  if (chip.href) {
    return (
      <Link
        to={chip.href}
        className={className}
        title={titleAttr}
        aria-disabled={chip.disabled || undefined}
        tabIndex={chip.disabled ? -1 : undefined}
        data-onboarding={chip.key}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      title={titleAttr}
      onClick={chip.onClick}
      aria-pressed={chip.active}
      disabled={chip.disabled}
      data-onboarding={chip.key}
    >
      {inner}
    </button>
  );
}

interface ForestCardProps {
  forestVisible: boolean;
  forestColorMode: ForestColorMode;
  onToggleMode: (mode: ForestColorMode) => void;
}

function ForestCard({ forestVisible, forestColorMode, onToggleMode }: ForestCardProps) {
  const isActive = (mode: ForestColorMode) => forestVisible && forestColorMode === mode;
  return (
    <div className={`${styles.forestCard}${forestVisible ? ` ${styles.forestCardActive}` : ""}`}>
      <span className={styles.forestLabel}>Лес</span>
      <div className={styles.forestPills} role="group" aria-label="Режим раскраски леса">
        <button
          type="button"
          className={`${styles.forestPill}${isActive("species") ? ` ${styles.forestPillActive}` : ""}`}
          onClick={() => onToggleMode("species")}
          aria-pressed={isActive("species")}
          title={getForestDescription("species").body}
          data-onboarding="species"
        >
          Породы
        </button>
        <button
          type="button"
          className={`${styles.forestPill}${isActive("bonitet") ? ` ${styles.forestPillActive}` : ""}`}
          onClick={() => onToggleMode("bonitet")}
          aria-pressed={isActive("bonitet")}
          title={getForestDescription("bonitet").body}
        >
          Бонитет
        </button>
        <button
          type="button"
          className={`${styles.forestPill}${isActive("age_group") ? ` ${styles.forestPillActive}` : ""}`}
          onClick={() => onToggleMode("age_group")}
          aria-pressed={isActive("age_group")}
          title={getForestDescription("age_group").body}
        >
          Возраст
        </button>
      </div>
    </div>
  );
}
