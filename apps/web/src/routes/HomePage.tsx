import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, ArrowRight } from "lucide-react";
import { Container } from "../components/layout/Container";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { fetchSpeciesNow, fetchStatsOverview } from "@mushroom-map/api-client";
import type { SpeciesNowResponse, StatsOverview, SpeciesNowTrend } from "@mushroom-map/types";
import styles from "./HomePage.module.css";

export function HomePage() {
  const [speciesNow, setSpeciesNow] = useState<SpeciesNowResponse | null>(null);
  const [overview, setOverview] = useState<StatsOverview | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSpeciesNow("14d", 3).then(
      (data) => { if (!cancelled) setSpeciesNow(data); },
      () => { /* keep null — widget renders empty state */ },
    );
    fetchStatsOverview().then(
      (data) => { if (!cancelled) setOverview(data); },
      () => { /* same */ },
    );
    return () => { cancelled = true; };
  }, []);

  return (
    <Container as="article" size="default">
      <section className={styles.hero}>
        <h1 className={styles.title}>Грибная карта Ленобласти</h1>
        <p className={styles.lead}>
          Интерактивная карта лесов области с указанием пород, возраста
          и продуктивности. Опирается на официальные данные ФГИС ЛК
          (Рослесхоз) — около двух миллионов выделов, покрывающих всю
          область от Выборга до Тихвина.
        </p>
        <p className={styles.sub}>
          Для каждого полигона — клик показывает, какие виды грибов
          теоретически там встречаются, с учётом породы дерева, бонитета
          и возрастной группы. Плюс открытая методология и данные
          ВК-сообществ в агрегатах.
        </p>
        <div className={styles.cta}>
          <Button as="link" to="/map" variant="primary">Открыть карту</Button>
        </div>
      </section>

      <SpeciesNowWidget data={speciesNow} />

      <section className={styles.grid}>
        <Card to="/species">
          <h3 className={styles.cardTitle}>Справочник видов</h3>
          <p className={styles.cardText}>
            Съедобность, сезон, в каких лесах водится, с чем можно спутать.
          </p>
        </Card>
        <Card to="/methodology">
          <h3 className={styles.cardTitle}>Методология</h3>
          <p className={styles.cardText}>
            Откуда данные, какие у них ограничения и чему не стоит доверять
            на 100%.
          </p>
        </Card>
      </section>

      <ScaleBar data={overview} />
    </Container>
  );
}

// ─── «Что сейчас растёт» ─────────────────────────────────────────────

function SpeciesNowWidget({ data }: { data: SpeciesNowResponse | null }) {
  return (
    <section className={styles.widget} aria-labelledby="widget-title">
      <header className={styles.widgetHeader}>
        <h2 id="widget-title" className={styles.widgetTitle}>
          Что сейчас растёт
        </h2>
        <p className={styles.widgetHint}>
          Топ-3 видов за последние 14 дней по VK-постам грибников.
        </p>
      </header>

      {data === null ? (
        <ul className={styles.widgetList}>
          {[0, 1, 2].map((i) => (
            <li key={i} className={styles.widgetSkeleton} aria-hidden="true" />
          ))}
        </ul>
      ) : data.items.length === 0 ? (
        <p className={styles.widgetEmpty}>
          За последние две недели данных не хватает — подождите пару дней
          после фактических находок в лесу.
        </p>
      ) : (
        <ul className={styles.widgetList}>
          {data.items.slice(0, 3).map((item) => (
            <li key={item.species_key} className={styles.widgetItem}>
              <div className={styles.widgetLabel}>
                <span className={styles.widgetName}>{item.label}</span>
                <TrendIcon trend={item.trend} />
              </div>
              <div className={styles.widgetMetric}>
                <span className={styles.widgetPct}>{item.pct}%</span>
                <span className={styles.widgetCount}>
                  {item.post_count} пост{pluralRu(item.post_count, "", "а", "ов")}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TrendIcon({ trend }: { trend: SpeciesNowTrend }) {
  if (trend === "up") return <TrendingUp size={14} className={styles.trendUp} aria-label="растёт" />;
  if (trend === "down") return <TrendingDown size={14} className={styles.trendDown} aria-label="падает" />;
  if (trend === "flat") return <Minus size={14} className={styles.trendFlat} aria-label="без изменений" />;
  return null;
}

// ─── Scale bar ───────────────────────────────────────────────────────

function ScaleBar({ data }: { data: StatsOverview | null }) {
  return (
    <section className={styles.scale} aria-label="Объём данных в проекте">
      {data === null ? (
        <span className={styles.scaleText} aria-hidden>
          Загружаем показатели…
        </span>
      ) : (
        <span className={styles.scaleText}>
          <strong>{data.district_count}</strong> районов ·{" "}
          <strong>{formatMillions(data.forest_polygon_count)}</strong> лесных
          выделов · <strong>{data.posts_classified.toLocaleString("ru-RU")}</strong>{" "}
          постов · обновлено {formatRefresh(data.last_vk_refresh)}
          <a href="/methodology" className={styles.scaleLink}>
            как собраны данные <ArrowRight size={14} aria-hidden />
          </a>
        </span>
      )}
    </section>
  );
}

// ─── Utils ───────────────────────────────────────────────────────────

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = n % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function formatMillions(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.?0+$/, "") + " млн";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "k";
  return String(n);
}

function formatRefresh(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 1) return "сегодня";
  if (days === 1) return "вчера";
  if (days < 7) return `${days} дн. назад`;
  if (days < 30) return `${Math.floor(days / 7)} нед. назад`;
  return then.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}
