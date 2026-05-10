/**
 * MapForecastPanel — right floating card с прогноз-индексом, name'ом
 * района (или ЛО overview) и DateScrubber'ом.
 * Source: docs/redesign-2026-05/claude-design/src/d1v2.jsx:424-437
 *
 * Responsive: на ≥720px — top-right floating; на mobile — нижний
 * bottom-sheet-like blok (без drag handles, простая внизу-карточка).
 */

import { IndexMeter } from "../IndexMeter";
import { DateScrubber } from "../sidebar/DateScrubber";
import { useMapMode } from "../../store/useMapMode";
import styles from "./MapForecastPanel.module.css";

export function MapForecastPanel() {
  const mode = useMapMode((s) => s.mode);
  const districtSlug = useMapMode((s) => s.districtSlug);
  // Phase W4: данные mock'нуты. Phase W6 — wire через
  // useForecastDistricts (запрашиваем по `selected` дате).
  const value = 0.78;
  const label = mode === "district" && districtSlug
    ? districtSlug
    : "Ленобласть · обзор";

  return (
    <aside
      className={`${styles.panel} card-interactive`}
      aria-label="Прогноз плодоношения"
    >
      <div className={styles.head}>
        <span className={styles.eyebrow}>индекс на завтра</span>
        <span className={styles.handAccent}>~ свежо</span>
      </div>
      <div className={styles.location}>{label}</div>

      <IndexMeter value={value} big />

      <p className={styles.lead}>
        После дождей 4–5 авг ожидается заметный слой{" "}
        <strong>белых</strong> и <strong>подберёзовиков</strong> в
        северо-западной части ЛО.
      </p>

      <div className={styles.scrubber}>
        <DateScrubber />
      </div>

      <div className={styles.meta}>
        <span>осадки 14 мм</span>
        <span>почва 16 °C</span>
        <span>72 ч</span>
      </div>
    </aside>
  );
}
