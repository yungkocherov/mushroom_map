/**
 * Forecast date scrubber — выбранная дата для choropleth прогноза.
 *
 * Дефолт: «сегодня» (UTC). DateScrubber выставляет одну из 7 (или 14
 * при раскрытии) пилюль; choropleth-layer на её изменение делает один
 * `setPaintProperty(...)` (нет нужды дёргать API повторно — данные за
 * 7 дней грузятся одним батчем в Phase 2).
 *
 * Phase 1: store-скелет.
 */
import { create } from "zustand";

/** ISO date string (YYYY-MM-DD) — формат API `/api/forecast/at?date=`. */
export type IsoDate = string;

export interface ForecastDateState {
  selected: IsoDate;
  /** «расширенный» 14-дневный режим скруббера */
  expanded: boolean;

  setSelected: (date: IsoDate) => void;
  setExpanded: (expanded: boolean) => void;
}

function todayIso(): IsoDate {
  // UTC, чтобы совпадало с серверным `_validate_date`.
  return new Date().toISOString().slice(0, 10);
}

export const useForecastDate = create<ForecastDateState>((set) => ({
  selected: todayIso(),
  expanded: false,

  setSelected: (date) => set({ selected: date }),
  setExpanded: (expanded) => set({ expanded }),
}));
