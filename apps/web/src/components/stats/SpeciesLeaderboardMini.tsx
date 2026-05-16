/** Топ видов по находкам (из corpus.classification). Пропсы —
 *  страница фетчит /api/stats/corpus. */
import type { StatsCorpusResponse } from "@mushroom-map/api-client";
import styles from "./SpeciesLeaderboardMini.module.css";

export function SpeciesLeaderboardMini({
  data,
  limit = 8,
}: { data: StatsCorpusResponse | null; limit?: number }) {
  const items = (data?.classification ?? []).slice(0, limit);
  if (items.length === 0) {
    return <div className={styles.box}><span className={styles.empty}>Нет данных классификации.</span></div>;
  }
  return (
    <div className={styles.box}>
      {items.map((it, i) => (
        <div key={it.species_key} className={styles.row}>
          <span className={styles.rank}>{i + 1}</span>
          <span className={styles.name}>{it.label}</span>
          <span className={styles.count}>{it.count.toLocaleString("ru-RU")}</span>
        </div>
      ))}
    </div>
  );
}
