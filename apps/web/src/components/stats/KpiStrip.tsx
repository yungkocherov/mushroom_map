/** KpiStrip — карточки ключевых чисел. Данные приходят пропсами
 *  (страница их фетчит). Никакого fetch здесь. */
import styles from "./KpiStrip.module.css";

export interface KpiItem {
  label: string;
  value: string;
}

export function KpiStrip({ items }: { items: KpiItem[] }) {
  return (
    <div className={styles.strip}>
      {items.map((it) => (
        <div key={it.label} className={styles.card}>
          <div className={styles.value}>{it.value}</div>
          <div className={styles.label}>{it.label}</div>
        </div>
      ))}
    </div>
  );
}
