/** «Сейчас собирают» — топ видов за окно. Пропсы из
 *  fetchSpeciesNow() (страница фетчит). */
import type { SpeciesNowResponse } from "@mushroom-map/types";
import styles from "./TrendingSpecies.module.css";

const ARROW: Record<string, string> = { up: "↑", down: "↓", flat: "→" };

export function TrendingSpecies({ data }: { data: SpeciesNowResponse | null }) {
  if (!data || data.items.length === 0) {
    return <div className={styles.box}><span className={styles.empty}>Пока нет свежих находок в окне.</span></div>;
  }
  return (
    <div className={styles.box}>
      {data.items.map((it) => {
        const tr = it.trend ?? "flat";
        return (
          <div key={it.species_key} className={styles.row}>
            <span className={styles.name}>{it.label}</span>
            <span className={styles.count}>{it.post_count} ({it.pct}%)</span>
            <span className={styles[tr as "up" | "down" | "flat"]}>{ARROW[tr] ?? "→"}</span>
          </div>
        );
      })}
    </div>
  );
}
