/**
 * SidebarOverview — состояние «обзор» у sidebar'а: eyebrow + H1 +
 * DateScrubber + топ-5 районов на выбранную дату + sources + preview-badge.
 *
 * Источник данных — `/api/forecast/districts?date=...`. Запрос
 * перезапускается при смене `useForecastDate.selected`. Список
 * сортируется по index DESC и берёт top-5.
 *
 * Phase 2: пока без real-time подписки на forecastChoroplethLayer
 * (тот сам делает свой fetch для feature-state). Кешировать через
 * shared хук — Phase 2.5 при wiring'е MapView.
 */
import {
  DISTRICT_ACCENTS,
  DEFAULT_ACCENT,
} from "@mushroom-map/tokens/district-accents";

import { useForecastDate } from "../../store/useForecastDate";
import { useForecastDistricts } from "../../store/useForecastDistricts";

import { DateScrubber } from "./DateScrubber";
import styles from "./SidebarOverview.module.css";

export interface SidebarOverviewProps {
  className?: string;
}

const TOP_N = 5;

export function SidebarOverview({ className }: SidebarOverviewProps) {
  const date = useForecastDate((s) => s.selected);
  const { rows, error } = useForecastDistricts(date);

  const top = (rows ?? [])
    .slice()
    .sort((a, b) => b.index - a.index)
    .slice(0, TOP_N);

  // TODO(phase-2): пока используем admin_area_id для accent lookup,
  // но district-accents.ts хранит OSM-id. Когда forecast_districts API
  // начнёт возвращать osm_rel_id отдельным полем, заменить здесь на
  // его. Сейчас лежит на догме «id из admin_area === osm_rel_id»,
  // что верно для текущего seed'а ingest_districts.py.
  function accentFor(adminAreaId: number): string {
    return DISTRICT_ACCENTS[adminAreaId] ?? DEFAULT_ACCENT;
  }

  return (
    <aside className={`${styles.root}${className ? ` ${className}` : ""}`}>
      <p className={styles.eyebrow}>Грибная погода · ЛО</p>
      <h1 className={styles.title}>Где сегодня грибы</h1>
      <p className={styles.lead}>
        Прогноз индекса плодоношения по 18 районам Ленобласти. Карта
        окрашена от прохладного зелёного (мимо) к лисичкиному оранжевому
        (хороший день). Данные модели — превью, до релиза реальной ML.
      </p>

      <span className={styles.previewBadge}>Превью · seeded fixture</span>

      <DateScrubber />

      <section className={styles.section} aria-label={`Топ-${TOP_N} районов на ${date}`}>
        <p className={styles.sectionLabel}>Топ-{TOP_N} районов</p>
        {error ? (
          <p className={styles.errorMsg}>не удалось загрузить прогноз: {error}</p>
        ) : (
          <ul className={styles.topList}>
            {top.map((r) => (
              <li key={r.admin_area_id} className={styles.topRow}>
                <span
                  className={styles.topAccent}
                  style={{ background: accentFor(r.admin_area_id) }}
                  aria-hidden="true"
                />
                <span className={styles.topName}>{r.district_name}</span>
                <span className={styles.topIndex}>{r.index.toFixed(1)}</span>
              </li>
            ))}
            {!error && rows !== null && top.length === 0 ? (
              <li className={styles.topRow}>
                <span className={styles.topName}>Нет данных на эту дату</span>
              </li>
            ) : null}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <p className={styles.sectionLabel}>Источники</p>
        <p className={styles.sources}>
          Лесхозданные — Рослесхоз / ФГИС ЛК. Гидрография — OpenStreetMap.
          Рельеф — Copernicus GLO-30 DEM. Прогноз — внутренняя модель
          mushroom-forecast (preview).
        </p>
      </section>
    </aside>
  );
}
