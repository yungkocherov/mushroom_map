/**
 * Layer visibility — single source of truth для всех тогглов карты.
 *
 * Заменяет 11 пар `useState` в `MapView.tsx`. Layer-модули
 * (forest/water/oopt/...) подписываются на `useLayerVisibility(s => s.forest)`
 * и сами реагируют на изменения, без прокидывания пропсов.
 *
 * `loaded` отделено от `visible` намеренно: layer тогглит видимость
 * (показать/спрятать), а `loaded` — это «pmtiles ответил, источник
 * установлен в карту». Используется LayerGrid'ом для disabled-state.
 *
 * Phase 1: только store + типы, ни один компонент пока не подписан.
 * Phase 2: MapView рефакторится на эту шину.
 */
import { create } from "zustand";

export type LayerKey =
  | "forest"
  | "water"
  | "waterway"
  | "wetland"
  | "oopt"
  | "roads"
  | "felling"
  | "protective"
  | "soil"
  | "hillshade"
  | "districts"
  | "forecastChoropleth"
  | "userSpots";

// Совпадает по литералам с `lib/forestStyle.ts:ForestColorMode` —
// LayerGrid → store → MapView controller передаёт строку 1-в-1, без
// маппинга. Перименование `age_group` → `age` потребует синхронной
// правки в обоих файлах.
export type ForestColorMode = "species" | "bonitet" | "age_group";

export type BaseMapMode = "osm" | "scheme" | "satellite" | "hybrid";

/** Lifecycle state for fading toasts: visible → fading (800ms transition) → hidden. */
export type ToastFadeState = "hidden" | "visible" | "fading";

export interface LayerVisibilityState {
  visible: Record<LayerKey, boolean>;
  loaded: Record<LayerKey, boolean>;
  forestColorMode: ForestColorMode;
  baseMap: BaseMapMode;
  setBaseMap: (mode: BaseMapMode) => void;
  /** Текст ошибки, отображаемый красным toast'ом ~5 сек. null = тоста нет. */
  errorMsg: string | null;
  /** Тост «спутник может не загружаться при VPN». 'visible' → 'fading' (800ms) → 'hidden'. */
  vpnToast: ToastFadeState;
  /** Тост-подсказка после первого включения forest. Тот же lifecycle. */
  forestHint: ToastFadeState;
  /** Тост «ссылка скопирована». Boolean — короткий 2-сек pulse. */
  shareToast: boolean;
  /** Бейдж активного species-фильтра. null = бейджа нет. */
  speciesFilterLabel: string | null;
  /** Активный species-фильтр для forest-fill: список slug'ов или null = без фильтра. */
  speciesFilter: string[] | null;
  setSpeciesFilter: (slugs: string[] | null, label: string | null) => void;

  setVisible: (key: LayerKey, value: boolean) => void;
  toggleVisible: (key: LayerKey) => void;
  setLoaded: (key: LayerKey, value: boolean) => void;
  setForestColorMode: (mode: ForestColorMode) => void;
  /** Включить forest и переключить mode одним действием — для LayerGrid. */
  selectForestMode: (mode: ForestColorMode) => void;
  setErrorMsg: (msg: string | null) => void;
  setVpnToast: (state: ToastFadeState) => void;
  setForestHint: (state: ToastFadeState) => void;
  setShareToast: (value: boolean) => void;
  setSpeciesFilterLabel: (label: string | null) => void;
}

const DEFAULT_VISIBLE: Record<LayerKey, boolean> = {
  forest: true,
  water: true,
  waterway: true,
  wetland: true,
  oopt: true,
  roads: true,
  felling: true,
  protective: true,
  soil: false, // профили почв — heavy slot, скрыт по умолчанию
  hillshade: true,
  districts: false, // отключено: район-как-логика убран (см. iter 2026-04-28)
  forecastChoropleth: false,
  userSpots: true,
};

const DEFAULT_LOADED: Record<LayerKey, boolean> = Object.fromEntries(
  Object.keys(DEFAULT_VISIBLE).map((k) => [k, false]),
) as Record<LayerKey, boolean>;

export const useLayerVisibility = create<LayerVisibilityState>((set) => ({
  visible: DEFAULT_VISIBLE,
  loaded: DEFAULT_LOADED,
  forestColorMode: "species",
  baseMap: "scheme",
  setBaseMap: (mode) => set({ baseMap: mode }),
  errorMsg: null,
  vpnToast: "hidden",
  forestHint: "hidden",
  shareToast: false,
  speciesFilterLabel: null,
  speciesFilter: null,

  setVisible: (key, value) =>
    set((s) => ({ visible: { ...s.visible, [key]: value } })),
  toggleVisible: (key) =>
    set((s) => ({ visible: { ...s.visible, [key]: !s.visible[key] } })),
  setLoaded: (key, value) =>
    set((s) => ({ loaded: { ...s.loaded, [key]: value } })),
  setForestColorMode: (mode) => set({ forestColorMode: mode }),
  selectForestMode: (mode) =>
    set((s) => ({
      visible: { ...s.visible, forest: true },
      forestColorMode: mode,
    })),
  setErrorMsg: (msg) => set({ errorMsg: msg }),
  setVpnToast: (state) => set({ vpnToast: state }),
  setForestHint: (state) => set({ forestHint: state }),
  setShareToast: (value) => set({ shareToast: value }),
  setSpeciesFilterLabel: (label) => set({ speciesFilterLabel: label }),
  setSpeciesFilter: (slugs, label) =>
    set({
      speciesFilter: slugs && slugs.length > 0 ? slugs : null,
      speciesFilterLabel: label,
    }),
}));
