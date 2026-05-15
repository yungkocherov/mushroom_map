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
  // V4.10: пока stats не пришёл, показываем «—» вместо нулевого/
  // хардкод-значения. Юзер жаловался что 0 км²/72k выделов появляются
  // первыми и потом перестраиваются на реальные — выглядит как баг.
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

  const [stats, setStats] = useState<StatsOverview | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchStatsOverview()
      .then((d) => !cancelled && setStats(d))
      .catch(() => {}); // fallback на хардкод-значения ниже
    return () => {
      cancelled = true;
    };
  }, []);

  const year = new Date().getFullYear();
  const updatedLabel = formatUpdated(stats?.forest_last_updated ?? null);

  // V4.10: НЕ показываем хардкод-fallback'и до прихода API — иначе
  // юзер видит 18/72k/0, потом значения перестраиваются на реальные
  // (≈18/1.2млн/47k). Лучше «—» до загрузки.
  const STATS: StatRow[] = [
    {
      value: stats?.district_count ?? null,
      label: "районов ЛО",
    },
    {
      value: stats?.forest_polygon_count ?? null,
      label: "выделов леса",
    },
    {
      value: stats?.forest_area_km2 != null ? Math.round(stats.forest_area_km2) : null,
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
