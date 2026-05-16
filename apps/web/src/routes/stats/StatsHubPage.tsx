/**
 * /stats — overview-хаб (Phase 2). Страница фетчит все эндпоинты и
 * раздаёт готовые данные презентационным виджетам (контракт для
 * Claude Design прохода: логика тут, презентация в виджетах).
 */
import { useEffect, useState } from "react";
import {
  fetchStatsMeta, fetchStatsCorpus, fetchSpeciesNow,
  fetchStatsTimeline, fetchStatsWeather,
  type StatsMeta, type StatsCorpusResponse,
  type StatsTimelineResponse, type StatsWeatherResponse,
} from "@mushroom-map/api-client";
import type { SpeciesNowResponse } from "@mushroom-map/types";
import { Container } from "../../components/layout/Container";
import { usePageTitle } from "../../lib/usePageTitle";
import { KpiStrip, type KpiItem } from "../../components/stats/KpiStrip";
import { TrendingSpecies } from "../../components/stats/TrendingSpecies";
import { ForestComposition } from "../../components/stats/ForestComposition";
import { SeasonPulse } from "../../components/stats/SeasonPulse";
import { SpeciesLeaderboardMini } from "../../components/stats/SpeciesLeaderboardMini";
import { WeatherSnapshot } from "../../components/stats/WeatherSnapshot";
import styles from "./StatsHubPage.module.css";
import prose from "../Prose.module.css";

function num(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n).toLocaleString("ru-RU") : "—";
}

export function StatsHubPage() {
  usePageTitle("Статистика — Geobiom", "Интерактивная статистика по лесам, грибным находкам, погоде и AI-классификации Ленобласти.");

  const [meta, setMeta] = useState<StatsMeta | null>(null);
  const [corpus, setCorpus] = useState<StatsCorpusResponse | null>(null);
  const [now, setNow] = useState<SpeciesNowResponse | null>(null);
  const [timeline, setTimeline] = useState<StatsTimelineResponse | null>(null);
  const [weather, setWeather] = useState<StatsWeatherResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      fetchStatsMeta(), fetchStatsCorpus(), fetchSpeciesNow("30d", 6),
      fetchStatsTimeline("all", 5000), fetchStatsWeather(),
    ]).then((r) => {
      if (cancelled) return;
      if (r[0].status === "fulfilled") setMeta(r[0].value);
      if (r[1].status === "fulfilled") setCorpus(r[1].value);
      if (r[2].status === "fulfilled") setNow(r[2].value);
      if (r[3].status === "fulfilled") setTimeline(r[3].value);
      if (r[4].status === "fulfilled") setWeather(r[4].value);
      if (r.every((x) => x.status === "rejected")) setError("Не удалось загрузить статистику");
    });
    return () => { cancelled = true; };
  }, []);

  const m = corpus?.metrics ?? {};
  const kpis: KpiItem[] = [
    { label: "выделов леса", value: num(m["forest_polygon_count"]) },
    { label: "км² леса", value: num(m["forest_area_km2"]) },
    { label: "видов", value: num(m["species_count"]) },
    { label: "районов", value: num(m["district_count"]) },
    { label: "VK-постов", value: num(m["posts_total"]) },
    { label: "классифицировано", value: num(m["posts_classified"]) },
  ];

  return (
    <Container as="section" size="wide">
      <header className={styles.header}>
        <p className={styles.eyebrow}>Данные проекта</p>
        <h1 className={prose.h1}>Статистика</h1>
        <p className={prose.lead}>
          Лес, грибные находки, погода и AI-классификация Ленобласти — по цифрам.
        </p>
        {error && <p className={prose.p} style={{ color: "var(--danger)" }}>{error}</p>}
        {meta && (
          <p className={styles.freshness}>
            {meta.generated_at
              ? `данные на ${new Date(meta.generated_at).toLocaleDateString("ru-RU")}`
              : "snapshot ещё не сформирован"}
          </p>
        )}
      </header>

      <KpiStrip items={kpis} />

      <div className={styles.full}>
        <SeasonPulse data={timeline} />
      </div>

      <div className={styles.grid}>
        <ForestComposition />
        <div>
          <h2 className={styles.sectionTitle}>Сейчас собирают</h2>
          <TrendingSpecies data={now} />
          <h2 className={styles.sectionTitle}>Топ видов</h2>
          <SpeciesLeaderboardMini data={corpus} />
        </div>
      </div>

      <div className={styles.full}>
        <h2 className={styles.sectionTitle}>Погода</h2>
        <WeatherSnapshot data={weather} />
      </div>
    </Container>
  );
}
