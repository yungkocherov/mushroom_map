/** Сезонный пульс — суммарные находки по месяцам года, выбор года.
 *  Данные — payload /api/stats/vk/timeline (страница фетчит). */
import { useMemo, useState } from "react";
import type { StatsTimelineResponse } from "@mushroom-map/api-client";
import { BarChart } from "./charts/BarChart";
import styles from "./SeasonPulse.module.css";

const MONTHS = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];

export function SeasonPulse({ data }: { data: StatsTimelineResponse | null }) {
  const byYear = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const p of data?.items ?? []) {
      if (!p.bucket) continue;
      const d = new Date(p.bucket);
      const y = d.getUTCFullYear();
      const mo = d.getUTCMonth();
      if (!m.has(y)) m.set(y, new Array(12).fill(0));
      m.get(y)![mo] += p.find_count;
    }
    return m;
  }, [data]);

  const years = useMemo(() => Array.from(byYear.keys()).sort((a, b) => b - a), [byYear]);
  const [year, setYear] = useState<number | null>(null);
  const activeYear = year ?? years[0] ?? null;

  if (years.length === 0) {
    return <div className={styles.box}><span className={styles.empty}>Нет данных активности.</span></div>;
  }
  const series = (byYear.get(activeYear!) ?? new Array(12).fill(0)).map((v, i) => ({
    name: MONTHS[i],
    finds: v,
  }));

  return (
    <div className={styles.box}>
      <div className={styles.head}>
        <span className={styles.title}>Сезонный пульс · {activeYear}</span>
        <div className={styles.years}>
          {years.slice(0, 8).map((y) => (
            <button
              key={y}
              type="button"
              className={`${styles.yr} ${y === activeYear ? styles.yrActive : ""}`}
              onClick={() => setYear(y)}
            >
              {y}
            </button>
          ))}
        </div>
      </div>
      <BarChart data={series} categoryKey="name" valueKey="finds" height={260} />
    </div>
  );
}
