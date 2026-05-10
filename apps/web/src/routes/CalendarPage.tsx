/**
 * Calendar — `/calendar`. Phase W5 full port of D1VCalendar.
 * Source: docs/redesign-2026-05/claude-design/src/d1v2-suite.jsx:218-311
 *
 * 12-month species ribbon: толщина полосы — длительность сезона,
 * dark отметка — пик. Текущий месяц подсвечен terra-bg. Animation:
 * `geobiom-grow-x` per row staggered 0.04s.
 */

import { usePageTitle } from "../lib/usePageTitle";
import {
  SPECIES_SEASONS,
  MONTH_LABELS_FULL,
} from "../lib/seasonality";
import styles from "./CalendarPage.module.css";

export function CalendarPage() {
  usePageTitle("Календарь — Geobiom");

  // 0-indexed current month; UTC matches forecast date logic.
  const cur = new Date().getUTCMonth();

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>сезон 2026 · ленобласть</span>
        <h1 className={styles.title}>
          Год, как{" "}
          <em className={styles.titleEm}>лента</em>.
        </h1>
        <p className={styles.lead}>
          12 месяцев, 12 видов. Толщина полосы — длительность сезона, тёмная
          отметка — пик плодоношения. Текущий месяц подсвечен.
        </p>
      </header>

      <section className={`${styles.ribbon} card-interactive`}>
        {/* Month header strip */}
        <div className={styles.monthStrip}>
          <span className={styles.monthLabel}>вид</span>
          {MONTH_LABELS_FULL.map((m, i) => (
            <span
              key={m}
              className={`${styles.month}${i === cur ? ` ${styles.monthCurrent}` : ""}`}
            >
              {m}
              {i === cur && <span className={styles.handAccent}>сейчас ↓</span>}
            </span>
          ))}
        </div>

        {/* Species rows */}
        <div className={styles.rowsWrap}>
          {/* current month vertical highlight */}
          <div
            className={styles.currentMonthHighlight}
            style={{ left: `calc(200px + ${cur} * ((100% - 200px) / 12))` }}
            aria-hidden="true"
          />
          {SPECIES_SEASONS.map((sp, idx) => (
            <div key={sp.ru} className={styles.row}>
              <div className={styles.species}>
                <span className={styles.speciesName}>{sp.ru}</span>
                <span className={styles.speciesLat}>{sp.lat}</span>
              </div>
              {Array.from({ length: 12 }).map((_, i) => {
                const m = i + 1;
                const on = m >= sp.start && m <= sp.end;
                const isPeak = m === sp.peak;
                return (
                  <div key={m} className={styles.cell}>
                    {on && (
                      <div
                        className={styles.bar}
                        style={{
                          height: isPeak ? 18 : 10,
                          background: isPeak ? sp.color : `${sp.color}99`,
                          transform: "scaleX(0)",
                          transformOrigin:
                            m === sp.start ? "left" : "center",
                          animation: `geobiom-grow-x 0.6s ${idx * 0.04}s cubic-bezier(0.2, 0.7, 0.2, 1) forwards`,
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Legend */}
        <footer className={styles.legend}>
          <div className={styles.legendItem}>
            <div
              className={styles.legendSwatch}
              style={{ width: 18, height: 10, background: "#5d6a3a99" }}
            />
            <span>сезон</span>
          </div>
          <div className={styles.legendItem}>
            <div
              className={styles.legendSwatch}
              style={{ width: 18, height: 18, background: "var(--forest)" }}
            />
            <span>пик плодоношения</span>
          </div>
          <div className={styles.legendItem}>
            <div
              className={styles.legendSwatch}
              style={{
                width: 14,
                height: 14,
                background: "rgba(184, 106, 58, 0.18)",
              }}
            />
            <span>текущий месяц</span>
          </div>
          <span className={styles.legendNote}>
            * данные модельные · реальная статистика подключается к API
          </span>
        </footer>
      </section>
    </div>
  );
}
