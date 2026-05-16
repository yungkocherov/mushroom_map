/** Состав леса ЛО с переключателем измерения. Интерактивный — сам
 *  фетчит выбранное измерение через api-client. График — через
 *  BarChart-обёртку (Recharts тут не виден). */
import { useEffect, useState } from "react";
import {
  fetchStatsForest,
  type StatsForestDimension,
  type StatsForestResponse,
} from "@mushroom-map/api-client";
import { BarChart } from "./charts/BarChart";
import styles from "./ForestComposition.module.css";

const DIMS: Array<{ key: StatsForestDimension; label: string }> = [
  { key: "species", label: "порода" },
  { key: "bonitet", label: "бонитет" },
  { key: "age_group", label: "возраст" },
  { key: "source", label: "источник" },
];

export function ForestComposition() {
  const [dim, setDim] = useState<StatsForestDimension>("species");
  const [data, setData] = useState<StatsForestResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStatsForest(dim)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setData({ dimension: dim, items: [] }));
    return () => { cancelled = true; };
  }, [dim]);

  const rows = (data?.items ?? []).map((i) => ({ name: i.label, km2: i.area_km2 }));

  return (
    <div className={styles.box}>
      <div className={styles.tabs}>
        {DIMS.map((d) => (
          <button
            key={d.key}
            className={`${styles.tab} ${dim === d.key ? styles.tabActive : ""}`}
            onClick={() => setDim(d.key)}
            type="button"
          >
            {d.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <span className={styles.empty}>Нет данных.</span>
      ) : (
        <BarChart data={rows} categoryKey="name" valueKey="km2" />
      )}
    </div>
  );
}
