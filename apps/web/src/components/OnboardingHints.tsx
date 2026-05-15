/**
 * OnboardingHints — inline 4-step onboarding tour поверх карты.
 *
 * Source: docs/redesign-2026-05/claude-design/src/hint-породы.jsx
 *         (HintV6/V7/V8/V9 + StepBadge + ArrowHint)
 *
 * Заменяет /onboarding wizard (4-step страница) inline overlay'ями на
 * самой карте. Шаги:
 *   1 (V6): подсветить «Породы» в LayerGrid
 *   2 (V7): подсветить «Болота»
 *   3 (V8): подсказка «нажми на любое лесное место»
 *   4 (V9): подсветить «Сохранить спот» внутри ForestPopup
 *
 * Локализация состояния — localStorage `geobiom.onboarding.step` через
 * onboardingStorage.ts. Каждый шаг auto-dismiss'ится по своему триггеру
 * + timeout + skip-link.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import {
  getOnboardingStep,
  setOnboardingStep,
  type OnboardingStep,
} from "../lib/onboardingStorage";
import { subscribeMap } from "../lib/mapInstance";

interface DOMRectLite {
  left: number;
  top: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}

function rectOf(el: HTMLElement | null): DOMRectLite | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    left: r.left,
    top: r.top,
    width: r.width,
    height: r.height,
    cx: r.left + r.width / 2,
    cy: r.top + r.height / 2,
  };
}

/**
 * Слушает изменения положения target-элемента (resize/scroll/mutation).
 * `selector` = CSS-селектор; пересматривается каждый рендер.
 */
function useTargetRect(selector: string): DOMRectLite | null {
  const [rect, setRect] = useState<DOMRectLite | null>(null);

  useLayoutEffect(() => {
    let cancelled = false;
    const update = () => {
      const el = document.querySelector<HTMLElement>(selector);
      const r = rectOf(el);
      if (!cancelled) setRect(r);
    };
    update();
    // Re-измеряем при layout-settle (шрифты могут догрузиться).
    const raf = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    // На случай если target монтируется позже (popup) — observer на body.
    const mo = new MutationObserver(update);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      mo.disconnect();
    };
  }, [selector]);

  return rect;
}

/**
 * Listen for click on element matching `selector` (capture phase, so
 * we react BEFORE the actual click handler fires).
 *
 * Use ref'у на onClick чтобы effect монтировался один раз и не пересоздавал
 * listener'а на каждом ре-рендере родителя. Inline arrow function в JSX
 * — новая ссылка каждый рендер, что и ломало старую реализацию.
 */
function useTargetClick(selector: string, onClick: () => void, enabled = true) {
  const cbRef = useRef(onClick);
  cbRef.current = onClick;
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(selector)) cbRef.current();
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [selector, enabled]);
}

/**
 * Возвращает X-координату правой границы ближайшей подложки
 * (`[data-onboarding-panel="..."]`). Нужно для V6/V7: текст и стрелка
 * должны начинаться правее подложки, иначе они лезут на саму панель
 * и читаются плохо.
 */
function useNearbyPanelRight(
  selector: string,
  ancestorSelector = "[data-onboarding-panel]",
): number | null {
  const [right, setRight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const update = () => {
      const target = document.querySelector<HTMLElement>(selector);
      if (!target) {
        setRight(null);
        return;
      }
      const panel = target.closest<HTMLElement>(ancestorSelector);
      setRight(panel ? panel.getBoundingClientRect().right : null);
    };
    update();
    const raf = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const mo = new MutationObserver(update);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      mo.disconnect();
    };
  }, [selector, ancestorSelector]);
  return right;
}

// ─── Root ───────────────────────────────────────────────────────────

export function OnboardingHints() {
  const [step, setStepState] = useState<OnboardingStep>(() =>
    getOnboardingStep(),
  );

  const advance = (next: OnboardingStep) => {
    setOnboardingStep(next);
    setStepState(next);
  };

  if (step === "done") return null;

  return (
    <div style={ROOT_STYLE} aria-live="polite">
      {step === 1 && <HintV6 onDismiss={() => advance(2)} onSkip={() => advance("done")} />}
      {step === 2 && <HintV7 onDismiss={() => advance(3)} onSkip={() => advance("done")} />}
      {step === 3 && <HintV8 onDismiss={() => advance(4)} onSkip={() => advance("done")} />}
      {step === 4 && <HintV9 onDismiss={() => advance("done")} onSkip={() => advance("done")} />}
    </div>
  );
}

// ─── Step components ────────────────────────────────────────────────

function HintV6({ onDismiss, onSkip }: { onDismiss: () => void; onSkip: () => void }) {
  const rect = useTargetRect('[data-onboarding="species"]');
  const panelRight = useNearbyPanelRight('[data-onboarding="species"]');
  useTargetClick('[data-onboarding="species"]', onDismiss);

  if (!rect) return null;
  return (
    <>
      <RadialDim cx={rect.cx} cy={rect.cy} radius={170} />
      <TargetGlow rect={rect} />
      <ArrowHint
        rect={rect}
        scale={2.2}
        originX={panelRight != null ? panelRight + 24 : undefined}
        title={
          <>
            начни <em style={EM}>отсюда</em>
          </>
        }
        sub="покажу что растёт →"
        delay={0.6}
      />
      <StepBadge n={1} label="породы" onSkip={onSkip} />
    </>
  );
}

function HintV7({ onDismiss, onSkip }: { onDismiss: () => void; onSkip: () => void }) {
  const rect = useTargetRect('[data-onboarding="wetland"]');
  const panelRight = useNearbyPanelRight('[data-onboarding="wetland"]');
  useTargetClick('[data-onboarding="wetland"]', onDismiss);

  if (!rect) return null;
  return (
    <>
      <RadialDim cx={rect.cx} cy={rect.cy} radius={150} />
      <TargetGlow rect={rect} />
      <ArrowHint
        rect={rect}
        scale={2.0}
        originX={panelRight != null ? panelRight + 24 : undefined}
        title={
          <>
            теперь <em style={EM}>болота</em>
          </>
        }
        sub="где грибы лезут после дождей →"
        delay={0.5}
      />
      <StepBadge n={2} label="болота" onSkip={onSkip} />
    </>
  );
}

/**
 * V8 — «нажми на этот выдел». При входе летим картой на Кирпичное,
 * подсвечиваем конкретный выдел стрелкой + рукописной подписью
 * по центру. Advance только когда юзер откроет popup в пределах
 * tolerance от target lat/lon.
 *
 * Конкретный выдел выбран автором руками — известно что в этой точке
 * сидит характерный сосновый бор с белыми/лисичками, прогноз ≥4.
 */
const V8_FLY = { lat: 60.468, lon: 29.368, zoom: 13 };
const V8_TARGET = { lat: 60.47479, lon: 29.32768 };
const V8_TARGET_TOLERANCE = 0.002; // ≈ 200m в широте; в долготе чуть уже

function HintV8({ onDismiss, onSkip }: { onDismiss: () => void; onSkip: () => void }) {
  // Subscribed map-instance — нужен для project(lat,lon) + flyTo.
  const [map, setMap] = useState<MaplibreMap | null>(null);
  useEffect(() => subscribeMap(setMap), []);

  // flyTo на Кирпичное один раз на mount.
  useEffect(() => {
    if (!map) return;
    map.flyTo({
      center: [V8_FLY.lon, V8_FLY.lat],
      zoom: V8_FLY.zoom,
      speed: 1.6,
      essential: true,
    });
  }, [map]);

  // Проецируем target lat/lon в screen-координаты и пересчитываем на
  // каждый map move/zoom событие, чтобы стрелка следила за выделом.
  const [pinXY, setPinXY] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!map) return;
    const update = () => {
      const p = map.project([V8_TARGET.lon, V8_TARGET.lat]);
      setPinXY({ x: p.x, y: p.y });
    };
    update();
    map.on("move", update);
    map.on("zoom", update);
    return () => {
      map.off("move", update);
      map.off("zoom", update);
    };
  }, [map]);

  // Advance ТОЛЬКО когда popup открыт на target-точке (в пределах
  // tolerance). Клик в другой выдел V8 не закроет.
  useEffect(() => {
    const onOpened = (e: Event) => {
      const ce = e as CustomEvent<{ lat: number; lon: number }>;
      if (!ce.detail) return;
      if (
        Math.abs(ce.detail.lat - V8_TARGET.lat) < V8_TARGET_TOLERANCE &&
        Math.abs(ce.detail.lon - V8_TARGET.lon) < V8_TARGET_TOLERANCE
      ) {
        onDismiss();
      }
    };
    window.addEventListener("mm:popup-opened", onOpened as EventListener);
    return () => window.removeEventListener("mm:popup-opened", onOpened as EventListener);
  }, [onDismiss]);

  const w = typeof window !== "undefined" ? window.innerWidth : 1200;
  const h = typeof window !== "undefined" ? window.innerHeight : 800;

  // Caption — по центру экрана, над пином (если пин видим), иначе
  // по центру viewport'а. Большой Caveat, terra.
  const captionX = pinXY ? pinXY.x : w / 2;
  const captionY = pinXY ? Math.max(40, pinXY.y - 140) : h / 2 - 60;

  return (
    <>
      {/* Радиальная дымка центрированная на target-пине (если есть) */}
      {pinXY && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            background: `radial-gradient(circle 220px at ${pinXY.x}px ${pinXY.y}px, rgba(18,16,12,0) 0%, rgba(18,16,12,0) 30%, rgba(18,16,12,.45) 80%, rgba(18,16,12,.55) 100%)`,
            pointerEvents: "none",
            animation: "geobiom-fadein .6s ease both",
            zIndex: 1,
          }}
        />
      )}

      {/* Discoverable pin — пульсирующий terra-маркер на target-точке */}
      {pinXY && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            left: pinXY.x,
            top: pinXY.y,
            transform: "translate(-50%, -50%)",
            zIndex: 3,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: 28,
              height: 28,
              marginLeft: -14,
              marginTop: -14,
              borderRadius: "50%",
              border: "2px solid var(--chanterelle)",
              animation: "hp-pulse-ring 2.4s ease-out infinite",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: 28,
              height: 28,
              marginLeft: -14,
              marginTop: -14,
              borderRadius: "50%",
              border: "2px solid var(--chanterelle)",
              animation: "hp-pulse-ring 2.4s 1.2s ease-out infinite",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: 22,
              height: 22,
              marginLeft: -11,
              marginTop: -11,
              borderRadius: "50%",
              background: "var(--chanterelle)",
              boxShadow:
                "0 0 0 4px var(--cream), 0 6px 14px rgba(184,106,58,.55)",
            }}
          />
        </div>
      )}

      {/* Caption над пином — Caveat-handwriting, по центру */}
      <div
        style={{
          position: "fixed",
          left: captionX,
          top: captionY,
          transform: "translate(-50%, 0) rotate(-3deg)",
          fontFamily: "var(--font-hand)",
          fontSize: 52,
          color: "var(--chanterelle)",
          lineHeight: 1.05,
          whiteSpace: "nowrap",
          animation: "hp-fadeup .55s .35s ease both",
          textShadow: "0 2px 14px rgba(0,0,0,.45)",
          zIndex: 3,
          pointerEvents: "none",
        }}
      >
        нажми <em style={EM}>сюда</em>
      </div>
      <div
        style={{
          position: "fixed",
          left: captionX,
          top: captionY + 56,
          transform: "translate(-50%, 0) rotate(-2deg)",
          fontFamily: "var(--font-hand)",
          fontSize: 26,
          color: "rgba(250,245,232,.9)",
          lineHeight: 1,
          whiteSpace: "nowrap",
          animation: "hp-fadeup .55s .7s ease both",
          textShadow: "0 2px 12px rgba(0,0,0,.55)",
          zIndex: 3,
          pointerEvents: "none",
        }}
      >
        ↓ покажу, что там растёт
      </div>

      <StepBadge n={3} label="точка" onSkip={onSkip} />
    </>
  );
}

function HintV9({ onDismiss, onSkip }: { onDismiss: () => void; onSkip: () => void }) {
  const rect = useTargetRect("[data-popup-save]");
  // Save-кнопка живёт внутри MapLibre popup'а — берём правый край
  // .maplibregl-popup чтобы текст и start стрелки уходили правее самой
  // карточки, не накладываясь на неё (как и V6/V7 относительно панели).
  const popupRight = useNearbyPanelRight("[data-popup-save]", ".maplibregl-popup");
  useTargetClick("[data-popup-save]", onDismiss);

  // Закрыли попап без save — тоже dismiss.
  useEffect(() => {
    const onClosed = () => onDismiss();
    window.addEventListener("mm:popup-closed", onClosed as EventListener);
    return () => window.removeEventListener("mm:popup-closed", onClosed as EventListener);
  }, [onDismiss]);

  if (!rect) return null;
  // Стиль идентичен V6/V7: тугой radial dim вокруг кнопки + glow-кольцо
  // + рукописная стрелка на scale 1.8. Дим частично затемнит верх
  // попап-карточки — это OK, фокус юзера должен быть на save-button.
  return (
    <>
      <RadialDim cx={rect.cx} cy={rect.cy} radius={170} />
      <TargetGlow rect={rect} />
      <ArrowHint
        rect={rect}
        scale={1.8}
        originX={popupRight != null ? popupRight + 24 : undefined}
        title={
          <>
            сохрани <em style={EM}>спот</em>
          </>
        }
        sub="и вернёшься сюда осенью →"
        delay={0.4}
      />
      <StepBadge n={4} label="сохрани" onSkip={onSkip} />
    </>
  );
}

// ─── Reusable pieces ────────────────────────────────────────────────

function RadialDim({
  cx,
  cy,
  radius,
  fadeStart = 0.28,
  maxAlpha = 0.62,
}: {
  cx: number;
  cy: number;
  radius: number;
  fadeStart?: number;
  maxAlpha?: number;
}) {
  // Прозрачный круг радиуса `radius * fadeStart` → дальше плавно к
  // `rgba(18,16,12,maxAlpha)`. mid-stop 78% даёт мягкий vignette.
  const mid = (fadeStart + 1) / 2;
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        background: `radial-gradient(circle ${radius}px at ${cx}px ${cy}px, rgba(18,16,12,0) 0%, rgba(18,16,12,0) ${fadeStart * 100}%, rgba(18,16,12,${maxAlpha * 0.94}) ${mid * 100}%, rgba(18,16,12,${maxAlpha}) 100%)`,
        pointerEvents: "none",
        animation: "geobiom-fadein .5s ease both",
        zIndex: 1,
      }}
    />
  );
}

function TargetGlow({ rect }: { rect: DOMRectLite }) {
  // Накладной box-shadow вокруг target'а — мерцающий glow без мутации
  // самой кнопки. Pointer-events: none — не перехватывает клик юзера.
  const PADDING = 4;
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        left: rect.left - PADDING,
        top: rect.top - PADDING,
        width: rect.width + PADDING * 2,
        height: rect.height + PADDING * 2,
        borderRadius: 12,
        pointerEvents: "none",
        animation: "hp-contour-pulse 2.2s ease-in-out infinite",
        zIndex: 2,
      }}
    />
  );
}

interface ArrowHintProps {
  rect: DOMRectLite;
  scale?: number;
  title: React.ReactNode;
  sub: string;
  delay?: number;
  /** Если задан — стрелка/текст начинаются от этого X (например, правая
   *  граница панели LayerGrid), а не от края button'а. Полезно когда
   *  button сидит внутри подложки и текст рядом с button'ом перекрывает
   *  её. Стрелка тогда длинная, тянется от текста до button'а. */
  originX?: number;
}

function ArrowHint({ rect, scale = 1, title, sub, delay = 0.5, originX }: ArrowHintProps) {
  // Stratifies right of the target — arrow curves from text down to the
  // button's right edge. Port из hint-породы.jsx ArrowHint side="right".
  // Если target ближе к правому краю экрана — флипаем влево.
  const k = scale;
  const w = typeof window !== "undefined" ? window.innerWidth : 1200;
  const buttonRight = rect.left + rect.width;
  // Якорь, от которого считаем смещения текста + arrow-start. По
  // умолчанию = край кнопки; если задан originX (правая граница
  // подложки) — берём его, чтобы текст не лез на панель.
  const anchorX = originX != null ? Math.max(originX, buttonRight + 4) : buttonRight + 4;
  const flipLeft = anchorX + 160 * k > w;

  const TX = flipLeft ? rect.left - 4 : buttonRight + 4;
  const TY = rect.top + rect.height / 2 + 1;
  // Стрелка стартует прямо у первой буквы текста — чтобы выглядело
  // что текст и стрелка едины. startX ≈ textX, чуть-чуть отступ слева
  // вглубь чтобы стрелка не «вылезала» из-под буквы.
  const textX = flipLeft ? TX - 220 * k : anchorX + 8 * k;
  const textY = TY + 50 * k;
  const subX = flipLeft ? TX - 200 * k : anchorX + 38 * k;
  const subY = TY + 90 * k;
  const startX = flipLeft ? textX + 30 * k : textX - 4 * k;
  const startY = TY + 40 * k;
  // Контрольная точка — на полпути между startX и TX, чуть выше TY,
  // даёт мягкую дугу.
  const ctlX = flipLeft ? (startX + TX) / 2 + 10 * k : (startX + TX) / 2 - 10 * k;
  const ctlY = TY - 6 * k;
  const rot = flipLeft ? 5 : -5;
  const subRot = flipLeft ? 4 : -4;
  const dasharray = Math.max(280, Math.hypot(startX - TX, startY - TY) * 1.7);

  // Wings of arrowhead aligned to curve tangent at TX/TY.
  const vx = ctlX - TX;
  const vy = ctlY - TY;
  const len = Math.hypot(vx, vy) || 1;
  const ux = vx / len;
  const uy = vy / len;
  const wing = (deg: number, s: number): [number, number] => {
    const a = (deg * Math.PI) / 180;
    const c = Math.cos(a);
    const si = Math.sin(a);
    return [(c * ux - si * uy) * s, (si * ux + c * uy) * s];
  };
  const [w1x, w1y] = wing(30, 13 * k);
  const [w2x, w2y] = wing(-30, 13 * k);
  const strokeW = (2.6 * k).toFixed(2);

  return (
    <>
      <svg
        width="100%"
        height="100%"
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 3,
        }}
      >
        <path
          d={`M ${startX} ${startY} Q ${ctlX} ${ctlY}, ${TX} ${TY}`}
          fill="none"
          stroke="var(--chanterelle)"
          strokeWidth={strokeW}
          strokeLinecap="round"
          style={{
            strokeDasharray: dasharray,
            strokeDashoffset: dasharray,
            animation: `hp-draw 1.1s ${delay}s cubic-bezier(.2,.7,.2,1) forwards`,
            // CSS custom property used by keyframe
            ["--len" as string]: dasharray,
          } as React.CSSProperties}
        />
        <g
          style={{
            opacity: 0,
            animation: `geobiom-fadein .25s ${delay + 0.9}s ease forwards`,
          }}
        >
          <path
            d={`M ${TX} ${TY} l ${w1x.toFixed(1)} ${w1y.toFixed(1)}`}
            stroke="var(--chanterelle)"
            strokeWidth={strokeW}
            strokeLinecap="round"
            fill="none"
          />
          <path
            d={`M ${TX} ${TY} l ${w2x.toFixed(1)} ${w2y.toFixed(1)}`}
            stroke="var(--chanterelle)"
            strokeWidth={strokeW}
            strokeLinecap="round"
            fill="none"
          />
        </g>
      </svg>
      <div
        style={{
          position: "fixed",
          left: textX,
          top: textY,
          fontFamily: "var(--font-hand)",
          fontSize: 32 * k,
          color: "var(--chanterelle)",
          lineHeight: 1,
          transform: `rotate(${rot}deg)`,
          whiteSpace: "nowrap",
          animation: `hp-fadeup .55s ${delay + 1.05}s ease both`,
          zIndex: 3,
          pointerEvents: "none",
          textShadow: "0 2px 14px rgba(0,0,0,.35)",
        }}
      >
        {title}
      </div>
      <div
        style={{
          position: "fixed",
          left: subX,
          top: subY,
          fontFamily: "var(--font-hand)",
          fontSize: 18 * k,
          color: "rgba(250,245,232,.85)",
          lineHeight: 1,
          transform: `rotate(${subRot}deg)`,
          whiteSpace: "nowrap",
          animation: `hp-fadeup .55s ${delay + 1.35}s ease both`,
          zIndex: 3,
          pointerEvents: "none",
          textShadow: "0 2px 14px rgba(0,0,0,.55)",
        }}
      >
        {sub}
      </div>
    </>
  );
}

function StepBadge({
  n,
  label,
  onSkip,
}: {
  n: number;
  label: string;
  onSkip: () => void;
}) {
  return (
    <div style={STEP_BADGE_WRAP}>
      <div style={STEP_BADGE_PILL}>
        <div style={STEP_BADGE_CIRCLE}>{n}</div>
        <span style={STEP_BADGE_META}>
          шаг&nbsp;{n}/4
        </span>
        <span style={STEP_BADGE_LABEL}>· {label}</span>
      </div>
      <button
        type="button"
        onClick={onSkip}
        style={STEP_BADGE_SKIP}
        title="Скрыть подсказки"
      >
        пропустить →
      </button>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────

// pointer-events: none на root — overlay не перехватывает клики, кроме
// явных кнопок (skip-link). Дочерние див'ы тоже pointer-events: none,
// чтобы radial-dim + glow + текст не блокировали клик по target'у.
const ROOT_STYLE: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 900, // выше MapTopBar/LayerGrid, ниже modal (1000)
  pointerEvents: "none",
};

const EM: React.CSSProperties = { fontStyle: "italic" };

const STEP_BADGE_WRAP: React.CSSProperties = {
  position: "fixed",
  top: 18,
  right: 18,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: 6,
  zIndex: 4,
  pointerEvents: "auto",
  animation: "hp-fadeup .5s ease both",
};

const STEP_BADGE_PILL: React.CSSProperties = {
  padding: "8px 14px 8px 8px",
  background: "var(--cream)",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  boxShadow:
    "0 6px 22px rgba(60,50,30,.14), 0 0 0 1px rgba(0,0,0,.05)",
};

const STEP_BADGE_CIRCLE: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: "50%",
  background: "var(--forest)",
  color: "var(--cream)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "var(--font-display)",
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1,
};

const STEP_BADGE_META: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  letterSpacing: ".14em",
  color: "var(--ink-dim)",
  textTransform: "uppercase",
};

const STEP_BADGE_LABEL: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 12,
  color: "var(--ink)",
};

const STEP_BADGE_SKIP: React.CSSProperties = {
  background: "transparent",
  border: 0,
  color: "rgba(250,245,232,.78)",
  fontFamily: "var(--font-body)",
  fontSize: 11,
  cursor: "pointer",
  padding: "2px 8px",
  textShadow: "0 1px 6px rgba(0,0,0,.4)",
};
