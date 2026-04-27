/**
 * DateScrubber — горизонтальный ряд из 7 «пилюль» (дней).
 * При раскрытии — 14 дней. Подписан на `useForecastDate`:
 *   - selected: ISO YYYY-MM-DD (UTC, как у API)
 *   - expanded: bool, для 14-дневного режима.
 *
 * Пилюли строятся от «сегодня» вперёд (max +13 дней). Спек API:
 *   `_DATE_FUTURE_DAYS = 30` → 14 дней — внутри валидного окна.
 *
 * onChange отсутствует — store сам уведомит подписчиков
 * (forecastChoroplethLayer) о смене даты.
 */
import { useMemo } from "react";

import { useForecastDate, type IsoDate } from "../../store/useForecastDate";
import styles from "./DateScrubber.module.css";

const DAY_LABELS_RU = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

export interface DateScrubberProps {
  className?: string;
}

interface DayCell {
  iso: IsoDate;
  dayOfWeek: string;
  dayOfMonth: number;
  isToday: boolean;
}

function buildCells(count: number): DayCell[] {
  const out: DayCell[] = [];
  const now = new Date();
  // Берём UTC, чтобы совпадать с серверным `_validate_date`.
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  for (let i = 0; i < count; i++) {
    const d = new Date(todayUtc);
    d.setUTCDate(todayUtc.getUTCDate() + i);
    out.push({
      iso: d.toISOString().slice(0, 10),
      dayOfWeek: DAY_LABELS_RU[d.getUTCDay()],
      dayOfMonth: d.getUTCDate(),
      isToday: i === 0,
    });
  }
  return out;
}

export function DateScrubber({ className }: DateScrubberProps) {
  const selected = useForecastDate((s) => s.selected);
  const expanded = useForecastDate((s) => s.expanded);
  const setSelected = useForecastDate((s) => s.setSelected);
  const setExpanded = useForecastDate((s) => s.setExpanded);

  const cells = useMemo(() => buildCells(expanded ? 14 : 7), [expanded]);

  return (
    <div className={`${styles.root}${className ? ` ${className}` : ""}`}>
      <div className={styles.row} role="group" aria-label="Дата прогноза">
        {cells.map((cell) => {
          const isActive = cell.iso === selected;
          return (
            <button
              key={cell.iso}
              type="button"
              className={`${styles.pill}${isActive ? ` ${styles.pillActive}` : ""}`}
              aria-pressed={isActive}
              aria-label={`${cell.dayOfWeek}, ${cell.dayOfMonth}, ${cell.iso}`}
              onClick={() => setSelected(cell.iso)}
            >
              <span className={styles.dayLabel}>
                {cell.isToday ? "сегодня" : cell.dayOfWeek}
              </span>
              {cell.dayOfMonth}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className={styles.expandToggle}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        {expanded ? "← 7 дней" : "14 дней →"}
      </button>
    </div>
  );
}
