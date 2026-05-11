/**
 * LandingMapCameo — preview карты на лендинге.
 *
 * V4.8 (redesign-2026-05-11): рендерится как <img src="/landing-cameo.jpg" />
 * — реальный скриншот /map с включёнными «Породами», который юзер
 * кладёт в `apps/web/public/landing-cameo.jpg`. Если файла нет — fallback
 * на статичный SVG StylizedMap (V4.5 версия, не требует сети).
 *
 * onerror на img триггерит state-flip → отрисуется SVG. Так что пока
 * юзер не положил файл, лендинг всё равно рендерится. После того как
 * файл появится в public/ и пройдёт deploy-web — img подхватится.
 */

import { useState } from "react";
import styles from "./LandingMapCameo.module.css";

type Props = {
  onClick?: () => void;
};

// Палитра StylizedMap fallback'а.
const BG          = "#ede1c8";
const WATER       = "#a9bccc";
const FOREST      = "#7d8e5a";
const FOREST_ALT  = "#5e7042";
const ROAD        = "rgba(0,0,0,.16)";
const ROAD_MAIN   = "rgba(184,106,58,.45)";
const LABEL       = "rgba(40,40,30,.6)";

const W = 900;
const H = 600;

export function LandingMapCameo({ onClick }: Props) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      className={styles.cameo}
      aria-label="Открыть карту"
    >
      {!imgFailed ? (
        <img
          src="/landing-cameo.jpg"
          alt="Превью карты ЛО с включенными слоями пород"
          className={styles.mapImg}
          onError={() => setImgFailed(true)}
          loading="eager"
          decoding="async"
        />
      ) : (
        <SvgFallback />
      )}
      <span className={styles.openHint}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M7 17 17 7" />
          <path d="M7 7h10v10" />
        </svg>
        открыть карту
      </span>
    </button>
  );
}

function SvgFallback() {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={styles.mapEl}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <pattern id="trees1" width="14" height="14" patternUnits="userSpaceOnUse">
          <path d="M7 3 L4 10 L10 10 Z" fill="rgba(50,80,50,.22)" />
        </pattern>
      </defs>
      <rect x="0" y="0" width={W} height={H} fill={BG} />
      <path
        d={`M0 ${H * 0.35} C ${W * 0.15} ${H * 0.4}, ${W * 0.25} ${H * 0.55}, ${W * 0.18} ${H * 0.7}
            L 0 ${H * 0.85} Z`}
        fill={WATER}
      />
      <path
        d={`M${W} ${H * 0.05} L ${W * 0.78} ${H * 0.05}
            C ${W * 0.82} ${H * 0.18}, ${W * 0.92} ${H * 0.22}, ${W} ${H * 0.28} Z`}
        fill={WATER}
      />
      <g>
        <path
          d={`M${W * 0.05} ${H * 0.05} C ${W * 0.3} ${H * 0.0},${W * 0.45} ${H * 0.15},${W * 0.55} ${H * 0.05}
              L ${W * 0.55} ${H * 0.32} C ${W * 0.4} ${H * 0.36},${W * 0.2} ${H * 0.4},${W * 0.05} ${H * 0.32} Z`}
          fill={FOREST}
        />
        <path
          d={`M${W * 0.55} ${H * 0.05} C ${W * 0.65} ${H * 0.18},${W * 0.7} ${H * 0.25},${W * 0.78} ${H * 0.05} Z`}
          fill={FOREST_ALT}
        />
        <path
          d={`M${W * 0.3} ${H * 0.45} C ${W * 0.5} ${H * 0.4},${W * 0.7} ${H * 0.5},${W * 0.78} ${H * 0.42}
              L ${W * 0.85} ${H * 0.6} C ${W * 0.7} ${H * 0.7},${W * 0.4} ${H * 0.72},${W * 0.25} ${H * 0.62} Z`}
          fill={FOREST_ALT}
        />
        <path
          d={`M${W * 0.4} ${H * 0.7} C ${W * 0.6} ${H * 0.68},${W * 0.78} ${H * 0.78},${W * 0.92} ${H * 0.72}
              L ${W} ${H * 0.95} L ${W * 0.32} ${H * 0.95} Z`}
          fill={FOREST}
        />
        <path
          d={`M${W * 0.05} ${H * 0.05} C ${W * 0.3} ${H * 0.0},${W * 0.45} ${H * 0.15},${W * 0.55} ${H * 0.05}
              L ${W * 0.55} ${H * 0.32} C ${W * 0.4} ${H * 0.36},${W * 0.2} ${H * 0.4},${W * 0.05} ${H * 0.32} Z`}
          fill="url(#trees1)"
        />
        <path
          d={`M${W * 0.3} ${H * 0.45} C ${W * 0.5} ${H * 0.4},${W * 0.7} ${H * 0.5},${W * 0.78} ${H * 0.42}
              L ${W * 0.85} ${H * 0.6} C ${W * 0.7} ${H * 0.7},${W * 0.4} ${H * 0.72},${W * 0.25} ${H * 0.62} Z`}
          fill="url(#trees1)"
        />
      </g>
      <g fill="none" stroke={WATER} strokeWidth="3" strokeLinecap="round">
        <path
          d={`M${W * 0.05} ${H * 0.5} C ${W * 0.25} ${H * 0.55}, ${W * 0.4} ${H * 0.6}, ${W * 0.65} ${H * 0.5}
              S ${W * 0.85} ${H * 0.45}, ${W} ${H * 0.55}`}
        />
        <path
          d={`M${W * 0.3} ${H * 0.95} C ${W * 0.4} ${H * 0.78}, ${W * 0.5} ${H * 0.7}, ${W * 0.6} ${H * 0.55}`}
        />
      </g>
      <g fill={WATER}>
        <ellipse cx={W * 0.4} cy={H * 0.18} rx="22" ry="9" />
        <ellipse cx={W * 0.62} cy={H * 0.32} rx="14" ry="7" />
        <ellipse cx={W * 0.7} cy={H * 0.78} rx="18" ry="8" />
        <ellipse cx={W * 0.18} cy={H * 0.55} rx="10" ry="5" />
      </g>
      <g fill="none" stroke={ROAD} strokeWidth="1.2">
        <path d={`M0 ${H * 0.6} L ${W} ${H * 0.62}`} />
        <path d={`M${W * 0.45} 0 L ${W * 0.5} ${H}`} />
        <path d={`M${W * 0.2} ${H * 0.1} L ${W * 0.85} ${H * 0.95}`} />
        <path
          d={`M${W * 0.1} ${H * 0.85} L ${W} ${H * 0.4}`}
          stroke={ROAD_MAIN}
          strokeWidth="2"
        />
      </g>
      <g fill={LABEL} fontFamily="inherit" fontSize="14">
        <text x={W * 0.48} y={H * 0.62}>СПб</text>
        <text x={W * 0.32} y={H * 0.45}>Зеленогорск</text>
        <text x={W * 0.6} y={H * 0.32}>Токсово</text>
        <text x={W * 0.55} y={H * 0.18}>Приозерск</text>
        <text x={W * 0.3} y={H * 0.85}>Гатчина</text>
        <text x={W * 0.78} y={H * 0.55}>Кировск</text>
        <text x={W * 0.08} y={H * 0.4} fontStyle="italic">Финский залив</text>
        <text x={W * 0.86} y={H * 0.18} fontStyle="italic">Ладога</text>
      </g>
    </svg>
  );
}
