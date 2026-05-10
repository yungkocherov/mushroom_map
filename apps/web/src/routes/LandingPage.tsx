import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { IndexMeter } from "../components/IndexMeter";
import { LandingMapCameo } from "../components/LandingMapCameo";
import { usePageTitle } from "../lib/usePageTitle";
import styles from "./LandingPage.module.css";

/**
 * Landing — `/`. Phase W3 full port of D1VLanding.
 * Source: docs/redesign-2026-05/claude-design/src/d1v2.jsx:263-350
 *
 * Hero «Лес, как атлас.» (с italic terra accent + mycelium underline),
 * 4 animated stat counters, 2 CTA, decorative contour wash background,
 * map cameo card с PulsePin маркерами + IndexMeter «Всеволожский ·
 * завтра».
 */

const STATS: ReadonlyArray<readonly [number, string]> = [
  [18,    "районов ЛО"],
  [25,    "видов"],
  [72_000, "выделов леса"],
  [11,    "лет наблюдений"],
];

function formatStat(n: number): string {
  if (n >= 1000) return `${Math.floor(n / 1000)}k`;
  return String(n);
}

function useCountUp(target: number, duration = 1100): number {
  const [n, setN] = useState(0);
  useEffect(() => {
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

function StatBlock({ value, label }: { value: number; label: string }) {
  const animated = useCountUp(value);
  return (
    <div className={styles.stat}>
      <div className={styles.statValue}>{formatStat(animated)}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

export function LandingPage() {
  usePageTitle("Geobiom — лес ленобласти");
  const navigate = useNavigate();

  return (
    <div className={styles.root}>
      {/* Decorative contour wash — `pointer-events:none` чтобы не блочить
          интеракции под собой. */}
      <ContourWash />

      <div className={styles.heroGrid}>
        {/* Left column: badge + headline + paragraph + CTA + stats */}
        <div className={styles.heroLeft}>
          <span className={styles.badge}>
            <span className={styles.badgePulse}>
              <span className={styles.badgePulseRing} />
              <span className={styles.badgeDot} />
            </span>
            сезон 2026 · открытые данные · обновлено сейчас
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
            .
          </h1>

          <p className={styles.lead}>
            Грибная погода Ленобласти: индекс плодоношения по 18 районам, типы
            леса и микориза для каждого выдела, личные споты в кабинете.
          </p>

          <div className={styles.ctaRow}>
            <Link to="/map" className={`${styles.btn} ${styles.btnPrimary} btn-interactive`}>
              Открыть карту
            </Link>
            <Link
              to="/methodology"
              className={`${styles.btn} ${styles.btnGhost} btn-interactive`}
            >
              Как это работает
            </Link>
          </div>

          <div className={styles.statsRow}>
            {STATS.map(([value, label]) => (
              <StatBlock key={label} value={value} label={label} />
            ))}
          </div>
        </div>

        {/* Right column: real MapLibre cameo (clickable → /map) +
            forecast snippet floating bottom of cameo. */}
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

