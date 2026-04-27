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

export type ForestColorMode = "species" | "bonitet" | "age";

export interface LayerVisibilityState {
  visible: Record<LayerKey, boolean>;
  loaded: Record<LayerKey, boolean>;
  forestColorMode: ForestColorMode;

  setVisible: (key: LayerKey, value: boolean) => void;
  toggleVisible: (key: LayerKey) => void;
  setLoaded: (key: LayerKey, value: boolean) => void;
  setForestColorMode: (mode: ForestColorMode) => void;
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
  districts: true,
  forecastChoropleth: false, // включается на /forecast и в district mode
  userSpots: true,
};

const DEFAULT_LOADED: Record<LayerKey, boolean> = Object.fromEntries(
  Object.keys(DEFAULT_VISIBLE).map((k) => [k, false]),
) as Record<LayerKey, boolean>;

export const useLayerVisibility = create<LayerVisibilityState>((set) => ({
  visible: DEFAULT_VISIBLE,
  loaded: DEFAULT_LOADED,
  forestColorMode: "species",

  setVisible: (key, value) =>
    set((s) => ({ visible: { ...s.visible, [key]: value } })),
  toggleVisible: (key) =>
    set((s) => ({ visible: { ...s.visible, [key]: !s.visible[key] } })),
  setLoaded: (key, value) =>
    set((s) => ({ loaded: { ...s.loaded, [key]: value } })),
  setForestColorMode: (mode) => set({ forestColorMode: mode }),
}));
