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
import styles from "./SidebarOverview.module.css";

export interface SidebarOverviewProps {
  className?: string;
}

export function SidebarOverview({ className }: SidebarOverviewProps) {
  return (
    <aside className={`${styles.root}${className ? ` ${className}` : ""}`}>
      <p className={styles.eyebrow}>Грибная погода · ЛО</p>
      <h1 className={styles.title}>Где сегодня грибы</h1>
      <p className={styles.lead}>
        Кликните в любую точку карты — попап покажет тип леса, почву и
        близость воды. Слои переключаются панелью справа на карте.
      </p>

      <section className={styles.section}>
        <p className={styles.sectionLabel}>Прогноз плодоношения</p>
        <p className={styles.sources}>
          Раскраску по районам убрали — она бы повторяла географию VK-постов
          (там, где больше людей пишет, модель «видит» больше грибов).
          Возвращаемся к этому, когда появится точечная модель на тип
          леса × погода × почва.
        </p>
      </section>

      <section className={styles.section}>
        <p className={styles.sectionLabel}>Источники</p>
        <p className={styles.sources}>
          Лесхозданные — Рослесхоз / ФГИС ЛК. Гидрография — OpenStreetMap.
          Рельеф — Copernicus GLO-30 DEM.
        </p>
      </section>
    </aside>
  );
}
