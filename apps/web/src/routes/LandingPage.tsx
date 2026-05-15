import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { fetchStatsOverview } from "@mushroom-map/api-client";
import type { StatsOverview } from "@mushroom-map/types";
import { IndexMeter } from "../components/IndexMeter";
import { LandingMapCameo } from "../components/LandingMapCameo";
import { usePageTitle } from "../lib/usePageTitle";
import styles from "./LandingPage.module.css";

/**
 * Landing — `/`. Hero «Лес, как атлас» (italic terra accent + mycelium
 * underline), 3 live-stat счётчика, 2 CTA, decorative contour wash,
 * map cameo (static PNG из /landing-cameo.png) с IndexMeter overlay.
 *
 * V4.8: точка из headline убрана, статистика тянется из
 * `/api/stats/overview` вместо хардкода. Badge «сезон / обновлено N
 * дней назад» — динамически из forest_last_updated.
 */

interface StatRow {
  value: number | null;
  label: string;
  /** Suffix к value — «км²», «лет», и т.п. Optional. */
  suffix?: string;
}

function formatStat(n: number): string {
  if (n >= 1_000_000) {
    // 1.2 млн / 1.25 млн — показываем 1 знак если результат < 10,
    // иначе целое («12 млн»). С Russian thin-space между числом и
    // единицей измерения для типографики.
    const m = n / 1_000_000;
    const formatted = m < 10 ? m.toFixed(1) : Math.round(m).toString();
    return `${formatted} млн`;
  }
  if (n >= 1000) return `${Math.floor(n / 1000)}k`;
  return String(n);
}

function useCountUp(target: number | null, duration = 1100): number | null {
  const [n, setN] = useState<number | null>(target);
  useEffect(() => {
    if (target == null) {
      setN(null);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      setN(Math.round(target * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return n;
}

function StatBlock({ value, label, suffix }: StatRow) {
  // V5: значение всегда определено (хардкод-fallback вместо null) —
  // landing загружается instant. Count-up анимация играет от 0 до
  // target, но визуально юзер с первого кадра видит финальное число
  // (анимация заканчивается за ~1с). Если API в фоне принесёт чуть
  // другое значение — count-up переиграется к новому.
  const animated = useCountUp(value);
  return (
    <div className={styles.stat}>
      <div className={styles.statValue}>
        {animated == null ? "—" : formatStat(animated)}
        {animated != null && suffix && <span className={styles.statSuffix}>{suffix}</span>}
      </div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

/** Форматирует ISO timestamp в «обновлено DD.MM.YYYY». V4.9: юзер
 *  предпочитает точную дату вместо relative «N дней назад». */
function formatUpdated(iso: string | null): string {
  if (!iso) return "обновлено недавно";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `обновлено ${dd}.${mm}.${yyyy}`;
}

export function LandingPage() {
  usePageTitle("Geobiom — лес ленобласти");
  const navigate = useNavigate();

  // V5 (2026-05-15): /api/stats/overview ~7s cold-request (SUM по 2.17M
  // forest_polygon). Backend теперь in-memory кеширует на 1ч + pre-warm
  // на старте, плюс Cache-Control 5min/SWR 24h. Но первый юзер всё ещё
  // может попасть на cold-start (после restart) — поэтому стартуем
  // ИЗ хардкод-фоллбека (реальные актуальные значения на момент билда),
  // и тихо обновляем когда fetch'и придёт реальное. Если хардкод чуть
  // расходится с актуальным (±1%) — допустимо, лучше чем пустой стейт.
  const STATIC_FALLBACK = {
    district_count: 18,
    forest_polygon_count: 1_232_000,
    forest_area_km2: 47_400,
    forest_last_updated: null as string | null,
  } as const;
  const [stats, setStats] = useState<StatsOverview | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchStatsOverview()
      .then((d) => !cancelled && setStats(d))
      .catch(() => {}); // fallback остаётся хардкод
    return () => {
      cancelled = true;
    };
  }, []);

  const year = new Date().getFullYear();
  const updatedLabel = formatUpdated(stats?.forest_last_updated ?? null);

  const STATS: StatRow[] = [
    {
      value: stats?.district_count ?? STATIC_FALLBACK.district_count,
      label: "районов ЛО",
    },
    {
      value: stats?.forest_polygon_count ?? STATIC_FALLBACK.forest_polygon_count,
      label: "выделов леса",
    },
    {
      value: stats?.forest_area_km2 != null
        ? Math.round(stats.forest_area_km2)
        : STATIC_FALLBACK.forest_area_km2,
      label: "км² покрытия",
    },
  ];

  return (
    <div className={styles.root}>
      <ContourWash />

      <div className={styles.heroGrid}>
        <div className={styles.heroLeft}>
          <span className={styles.badge}>
            <span className={styles.badgePulse}>
              <span className={styles.badgePulseRing} />
              <span className={styles.badgeDot} />
            </span>
            сезон {year} · открытые данные · {updatedLabel}
          </span>

          <h1 className={styles.headline}>
            Лес,
            <br />
            как{" "}
            <span className={styles.atlas}>
              <em>атлас</em>
              <svg
                className={styles.atlasUnderline}
                viewBox="0 0 220 14"
                aria-hidden="true"
                preserveAspectRatio="none"
              >
                <path
                  d="M2 8 Q 40 2, 80 7 T 160 7 T 218 6"
                  fill="none"
                  stroke="var(--chanterelle)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeDasharray={240}
                  strokeDashoffset={240}
                  style={{ animation: "geobiom-myco 1.4s 1s cubic-bezier(0.2,0.7,0.2,1) forwards" }}
                />
              </svg>
            </span>
          </h1>

          <p className={styles.lead}>
            Грибная погода Ленобласти: индекс плодоношения по 18 районам, типы
            леса и микориза для каждого выдела, личные точки в кабинете.
          </p>

          <div className={styles.ctaRow}>
            <Link to="/map" className={`${styles.btn} ${styles.btnPrimary}`}>
              Открыть карту
            </Link>
            <Link
              to="/methodology"
              className={`${styles.btn} ${styles.btnGhost}`}
            >
              Как это работает
            </Link>
          </div>

          <div className={styles.statsRow}>
            {STATS.map((s) => (
              <StatBlock key={s.label} value={s.value} label={s.label} suffix={s.suffix} />
            ))}
          </div>
        </div>

        <div className={styles.cameoWrap}>
          <LandingMapCameo onClick={() => navigate("/map")} />
          <div className={styles.cameoCard}>
            <div className={styles.cameoCardHead}>
              <span className={styles.cameoCardLabel}>
                Всеволожский · завтра
              </span>
              <span className={styles.cameoCardHand}>~ свежо</span>
            </div>
            <IndexMeter value={0.78} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Contour wash background — full-bleed decorative SVG overlay.
 * 14 параллельных «топо-линий» с радиальными gradient'ами от моха и
 * лисичкового цвета.
 */
function ContourWash() {
  return (
    <>
      <div className={styles.washGradient} aria-hidden="true" />
      <svg
        className={styles.washContours}
        viewBox="0 0 1280 800"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <g fill="none" stroke="var(--bark)" strokeWidth={0.7}>
          {Array.from({ length: 14 }).map((_, i) => (
            <path
              key={i}
              d={`M-50 ${120 + i * 48} Q 320 ${100 + i * 46}, 640 ${130 + i * 48} T 1330 ${110 + i * 46}`}
            />
          ))}
        </g>
      </svg>
    </>
  );
}
