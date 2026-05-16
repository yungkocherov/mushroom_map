/** Погода ЛО: средняя температура по месяцам — последний доступный
 *  год. Данные из /api/stats/weather (страница фетчит). Пусто, если
 *  forecast.* отсутствует. */
import { useMemo } from "react";
import type { StatsWeatherResponse } from "@mushroom-map/api-client";
import { LineChart } from "./charts/LineChart";
import styles from "./WeatherSnapshot.module.css";

const MONTHS = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];

export function WeatherSnapshot({ data }: { data: StatsWeatherResponse | null }) {
  const series = useMemo(() => {
    const months = data?.months ?? [];
    if (months.length === 0) return [];
    const latest = Math.max(...months.map((m) => m.year));
    return months
      .filter((m) => m.year === latest)
      .sort((a, b) => a.month - b.month)
      .map((m) => ({ name: MONTHS[m.month - 1] ?? String(m.month), temp: m.temp_mean ?? 0 }));
  }, [data]);

  if (series.length === 0) {
    return (
      <div className={styles.box}>
        <div className={styles.title}>Погода</div>
        <span className={styles.empty}>Данные погоды появятся после синхронизации forecast-репозитория.</span>
      </div>
    );
  }
  return (
    <div className={styles.box}>
      <div className={styles.title}>Средняя температура по месяцам</div>
      <LineChart data={series} xKey="name" yKey="temp" height={220} />
    </div>
  );
}
