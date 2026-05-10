import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { IndexMeter } from "../components/IndexMeter";
import { PulsePin } from "../components/PulsePin";
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

        {/* Right column: stylised map cameo with pins and forecast card */}
        <div className={styles.cameoWrap}>
          <div className={styles.cameo}>
            <CameoMap />
            <div className={styles.cameoPin1}>
              <PulsePin color="var(--chanterelle)" size={14} />
            </div>
            <div className={styles.cameoPin2}>
              <PulsePin color="var(--moss)" size={11} delay={0.6} />
            </div>
            <div className={styles.cameoPin3}>
              <PulsePin color="var(--bark)" size={10} delay={1.2} />
            </div>
            <div className={styles.cameoNote}>мой спот →</div>
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

/**
 * Stylised forest map for the hero cameo. Не использует MapLibre — для
 * Landing мы хотим лёгкий decorative SVG без heavy bundle. Если в
 * будущем потребуется live-карта — заменим на mini MapLibre.
 */
function CameoMap() {
  return (
    <svg
      viewBox="0 0 400 500"
      preserveAspectRatio="xMidYMid slice"
      className={styles.cameoSvg}
      aria-hidden="true"
    >
      <rect x={0} y={0} width={400} height={500} fill="#ede1c8" />
      {/* Gulf of Finland (left) */}
      <path
        d="M0 175 C 60 200, 100 275, 72 350 L 0 425 Z"
        fill="#a9bccc"
      />
      {/* Lake Ladoga corner (top-right) */}
      <path
        d="M400 25 L 312 25 C 328 90, 368 110, 400 140 Z"
        fill="#a9bccc"
      />
      {/* Forest blobs */}
      <path
        d="M20 25 C 120 0, 180 75, 220 25 L 220 160 C 160 180, 80 200, 20 160 Z"
        fill="#7d8e5a"
      />
      <path
        d="M220 25 C 260 90, 280 125, 312 25 Z"
        fill="#5e7042"
      />
      <path
        d="M120 225 C 200 200, 280 250, 312 210 L 340 300 C 280 350, 160 360, 100 310 Z"
        fill="#5e7042"
      />
      <path
        d="M160 350 C 240 340, 312 390, 368 360 L 400 475 L 128 475 Z"
        fill="#7d8e5a"
      />
      {/* Rivers */}
      <g fill="none" stroke="#a9bccc" strokeWidth={3} strokeLinecap="round">
        <path d="M20 250 C 100 275, 160 300, 260 250 S 340 225, 400 275" />
        <path d="M120 475 C 160 390, 200 350, 240 275" />
      </g>
      {/* Small lakes */}
      <g fill="#a9bccc">
        <ellipse cx={160} cy={90}  rx={22} ry={9}  />
        <ellipse cx={248} cy={160} rx={14} ry={7}  />
        <ellipse cx={280} cy={390} rx={18} ry={8}  />
        <ellipse cx={72}  cy={275} rx={10} ry={5}  />
      </g>
      {/* Roads */}
      <g fill="none">
        <path d="M0 300 L 400 310"      stroke="rgba(0,0,0,0.18)" strokeWidth={1.2} />
        <path d="M180 0 L 200 500"      stroke="rgba(0,0,0,0.18)" strokeWidth={1.2} />
        <path d="M40 425 L 400 200"     stroke="rgba(184,106,58,0.55)" strokeWidth={2} />
      </g>
    </svg>
  );
}
