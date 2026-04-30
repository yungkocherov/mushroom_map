/**
 * Map mode — «обзорный» (вся ЛО, choropleth прогноза) vs «детальный»
 * (выбран один район, fitBounds на его геометрию).
 *
 * Управляет:
 *   - какой Sidebar рендерится (Overview vs District)
 *   - flyTo/fitBounds в MapView на смене districtId
 *   - подсветку выбранного района на choropleth
 *
 * Phase 1: store + типы, потребителей пока нет.
 * Phase 2: SidebarOverview/SidebarDistrict читают `mode`, MapView
 *          реагирует на districtId через useEffect.
 */
import { create } from "zustand";
import { track } from "../lib/track";

export type MapMode = "overview" | "district";

export interface MapModeState {
  mode: MapMode;
  /** admin_area.id выбранного района, либо null для overview */
  districtId: number | null;
  /** ASCII-slug района для URL (`/map/luzhsky`); null для overview */
  districtSlug: string | null;

  setOverview: () => void;
  setDistrict: (id: number, slug: string) => void;
}

export const useMapMode = create<MapModeState>((set) => ({
  mode: "overview",
  districtId: null,
  districtSlug: null,

  setOverview: () => set({ mode: "overview", districtId: null, districtSlug: null }),
  setDistrict: (id, slug) => {
    // Аналитика: фиксируем slug района (slug ≠ PII, это OSM admin_area).
    track("district.open", { name: slug });
    set({ mode: "district", districtId: id, districtSlug: slug });
  },
}));
