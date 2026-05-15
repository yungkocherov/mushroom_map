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
 *
 * `livePoll=true` дополнительно опрашивает rect на каждом rAF — нужно
 * когда target живёт внутри MapLibre popup'а: попап перепозиционируется
 * через CSS-transform при каждом move-event карты, но MutationObserver
 * со `childList`-фильтром этого не видит. Только для активного V9 —
 * остальные хинты используют дефолтный (одноразовый) режим.
 */
function useTargetRect(selector: string, livePoll = false): DOMRectLite | null {
  const [rect, setRect] = useState<DOMRectLite | null>(null);

  useLayoutEffect(() => {
    let cancelled = false;
    let raf = 0;
    const tick = () => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(selector);
      const r = rectOf(el);
      setRect((prev) => {
        if (!r && !prev) return prev;
        if (
          r && prev &&
          r.left === prev.left &&
          r.top === prev.top &&
          r.width === prev.width &&
          r.height === prev.height
        ) {
          return prev;
        }
        return r;
      });
      if (livePoll) raf = requestAnimationFrame(tick);
    };
    tick();
    if (!livePoll) {
      // Re-измеряем при layout-settle (шрифты могут догрузиться).
      raf = requestAnimationFrame(tick);
    }
    window.addEventListener("resize", tick);
    window.addEventListener("scroll", tick, true);
    // На случай если target монтируется позже (popup) — observer на body.
    const mo = new MutationObserver(tick);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", tick);
      window.removeEventListener("scroll", tick, true);
      mo.disconnect();
    };
  }, [selector, livePoll]);

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
 * window.addEventListener в режиме ref-callback: listener подписывается
 * один раз на mount, но всегда вызывает АКТУАЛЬНУЮ версию handler'а
 * (через cbRef). Это лечит баг V8/V9 — раньше listener для
 * mm:popup-closed жил с deps=[onDismiss], а onDismiss — inline-arrow
 * из родителя; effect пересоздавался каждый ре-рендер и мог пропустить
 * event между cleanup'ом и re-setup'ом (mm:popup-closed как раз
 * стреляет из cleanup ForestPopup'а, т.е. в очень неудачный момент).
 */
function useWindowEvent(
  name: string,
  handler: () => void,
  enabled = true,
) {
  const cbRef = useRef(handler);
  cbRef.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const fn = () => cbRef.current();
    window.addEventListener(name, fn);
    return () => window.removeEventListener(name, fn);
  }, [name, enabled]);
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
  livePoll = false,
): number | null {
  const [right, setRight] = useState<number | null>(null);
  useLayoutEffect(() => {
    let cancelled = false;
    let raf = 0;
    const tick = () => {
      if (cancelled) return;
      const target = document.querySelector<HTMLElement>(selector);
      if (!target) {
        setRight((prev) => (prev === null ? prev : null));
      } else {
        const panel = target.closest<HTMLElement>(ancestorSelector);
        const next = panel ? panel.getBoundingClientRect().right : null;
        setRight((prev) => (prev === next ? prev : next));
      }
      if (livePoll) raf = requestAnimationFrame(tick);
    };
    tick();
    if (!livePoll) raf = requestAnimationFrame(tick);
    window.addEventListener("resize", tick);
    window.addEventListener("scroll", tick, true);
    const mo = new MutationObserver(tick);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", tick);
      window.removeEventListener("scroll", tick, true);
      mo.disconnect();
    };
  }, [selector, ancestorSelector, livePoll]);
  return right;
}

// ─── Root ───────────────────────────────────────────────────────────

/**
 * Какой step разрешает interaction с каким селектором. Используется
 * блокировщиком кликов: всё что не matches allowedSelector — игнор.
 * 'done' и loading-фазы блокируют всё кроме [data-onboarding-control].
 */
const ALLOWED_SELECTOR_BY_STEP: Record<Exclude<OnboardingStep, "done">, string> = {
  1: '[data-onboarding="basemap-hybrid"]',
  2: '[data-onboarding="species"]',
  3: '[data-onboarding="wetland"]',
  // Шаг 4 — клик по карте; нужно разрешить .maplibregl-canvas
  4: ".maplibregl-canvas",
  // Шаг 5 (info-only) — любой клик закрывает; селектор = '*'
  5: "*",
};

export function OnboardingHints() {
  const [step, setStepState] = useState<OnboardingStep>(() =>
    getOnboardingStep(),
  );
  // Loading-overlay между шагами: после step 2 (Породы) ждём forest
  // pmtiles + colors; после step 3 (Болота) — wetland. 2.5 сек хватает
  // с запасом. localState, не персистим.
  const [loadingPhase, setLoadingPhase] = useState<null | "after-species" | "after-wetland">(null);

  const advance = (next: OnboardingStep) => {
    // Loading-фазы только после Породы (step 2 → 3) и Болота (3 → 4).
    if (step === 2 && next === 3) {
      setLoadingPhase("after-species");
      return;
    }
    if (step === 3 && next === 4) {
      setLoadingPhase("after-wetland");
      return;
    }
    setOnboardingStep(next);
    setStepState(next);
  };

  const finishLoading = () => {
    if (loadingPhase === "after-species") {
      setLoadingPhase(null);
      setOnboardingStep(3);
      setStepState(3);
    } else if (loadingPhase === "after-wetland") {
      setLoadingPhase(null);
      setOnboardingStep(4);
      setStepState(4);
    }
  };

  const skipAll = () => {
    setLoadingPhase(null);
    setOnboardingStep("done");
    setStepState("done");
  };

  // Блок не-target кликов.
  const allowedSelector =
    step !== "done" && loadingPhase === null
      ? ALLOWED_SELECTOR_BY_STEP[step]
      : null;
  useBlockNonTargetClicks(allowedSelector);

  // Блок map-interactions (zoom/pan/double-click) во время онбординга.
  useBlockMapInteractions(step !== "done");

  if (step === "done") return null;

  return (
    <div style={ROOT_STYLE} aria-live="polite">
      {loadingPhase === null && step === 1 && <HintV5Hybrid onDismiss={() => advance(2)} onSkip={skipAll} />}
      {loadingPhase === null && step === 2 && <HintV6 onDismiss={() => advance(3)} onSkip={skipAll} />}
      {loadingPhase === null && step === 3 && <HintV7 onDismiss={() => advance(4)} onSkip={skipAll} />}
      {loadingPhase === null && step === 4 && <HintV8 onDismiss={() => advance(5)} onSkip={skipAll} />}
      {loadingPhase === null && step === 5 && <HintV9Info onDismiss={() => advance("done")} onSkip={skipAll} />}
      {loadingPhase !== null && (
        <LoadingHint
          message={
            loadingPhase === "after-species"
              ? "Подгружаем породы леса…"
              : "Подгружаем болота…"
          }
          onDone={finishLoading}
        />
      )}
      <SkipTourButton onClick={skipAll} />
    </div>
  );
}

/**
 * Блокирует scrollZoom / doubleClickZoom / dragPan / keyboard на
 * MapLibre instance во время онбординга. Включаем обратно на cleanup.
 */
function useBlockMapInteractions(enabled: boolean) {
  const [map, setMap] = useState<MaplibreMap | null>(null);
  useEffect(() => subscribeMap(setMap), []);
  useEffect(() => {
    if (!map || !enabled) return;
    map.scrollZoom.disable();
    map.doubleClickZoom.disable();
    map.boxZoom.disable();
    map.keyboard.disable();
    map.touchZoomRotate.disable();
    map.touchPitch.disable();
    // dragPan и dragRotate оставляем — пользователь может нечаянно
    // тронуть карту, но в целом перемещение не критично. Если решим
    // блокировать тоже — раскомментируй.
    // map.dragPan.disable();
    return () => {
      map.scrollZoom.enable();
      map.doubleClickZoom.enable();
      map.boxZoom.enable();
      map.keyboard.enable();
      map.touchZoomRotate.enable();
      map.touchPitch.enable();
      // map.dragPan.enable();
    };
  }, [map, enabled]);
}

/**
 * Блокирует все клики кроме intended-target и [data-onboarding-control].
 * Capture-phase listener — прерывает propagation до app handler'ов.
 */
function useBlockNonTargetClicks(allowedSelector: string | null) {
  const allowedRef = useRef(allowedSelector);
  allowedRef.current = allowedSelector;
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const sel = allowedRef.current;
      if (!sel) return; // блокировка выключена
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Разрешаем skip/help-кнопки оверлея.
      if (target.closest("[data-onboarding-control]")) return;
      // Разрешаем любые открытые modal'ы (SaveSpotModal etc) — иначе
      // юзер открыл бы save-button, дальше не смог бы заполнить форму.
      if (target.closest('[role="dialog"]')) return;
      // Разрешаем intended target.
      if (target.closest(sel)) return;
      // Всё остальное — блок.
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    document.addEventListener("click", handler, true);
    document.addEventListener("mousedown", handler, true);
    return () => {
      document.removeEventListener("click", handler, true);
      document.removeEventListener("mousedown", handler, true);
    };
  }, []);
}

/**
 * Skip-tour кнопка снизу справа. Видна на всех шагах онбординга;
 * клик → step='done' (persist), все хинты убираются.
 */
function SkipTourButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      data-onboarding-control="skip"
      onClick={onClick}
      style={SKIP_TOUR_BTN_STYLE}
      title="Пропустить обучение и вернуться к карте"
    >
      Пропустить обучение
    </button>
  );
}

/**
 * «?» — публичная кнопка «запустить обучение заново». Рендерится
 * MapHomePage'ом всегда, не только во время онбординга. Сбрасывает
 * localStorage.step на 1 → OnboardingHints поднимется заново.
 */
export function OnboardingRestartButton() {
  const handle = () => {
    setOnboardingStep(1);
    // Force re-render OnboardingHints via reload — иначе нужно
    // прокидывать setStep через context. Дешевле reload.
    if (typeof window !== "undefined") window.location.reload();
  };
  return (
    <button
      type="button"
      data-onboarding-control="help"
      onClick={handle}
      style={HELP_BTN_STYLE}
      title="Запустить обучение заново"
      aria-label="Запустить обучение заново"
    >
      ?
    </button>
  );
}

// ─── Step components ────────────────────────────────────────────────

// Глобальные тайминги анимаций. Юзер хотел чтоб текст и стрелка
// появлялись раньше: 0.6 → 0.1 сек delay. hp-draw 1.1s → 0.7s.
const HINT_DELAY = 0.1;

function HintV5Hybrid({ onDismiss, onSkip }: { onDismiss: () => void; onSkip: () => void }) {
  const rect = useTargetRect('[data-onboarding="basemap-hybrid"]');
  const panelRight = useNearbyPanelRight('[data-onboarding="basemap-hybrid"]');
  useTargetClick('[data-onboarding="basemap-hybrid"]', onDismiss);

  if (!rect) return null;
  return (
    <>
      <RadialDim cx={rect.cx} cy={rect.cy} radius={170} />
      <TargetGlow rect={rect} />
      <ArrowHint
        rect={rect}
        scale={2.0}
        originX={panelRight != null ? panelRight + 24 : undefined}
        title={
          <>
            включи <em style={EM}>гибрид</em>
          </>
        }
        sub="спутник + надписи →"
        delay={HINT_DELAY}
      />
      <StepBadge n={1} label="гибрид" onSkip={onSkip} />
    </>
  );
}

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
        delay={HINT_DELAY}
      />
      <StepBadge n={2} label="породы" onSkip={onSkip} />
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
        delay={HINT_DELAY}
      />
      <StepBadge n={3} label="болота" onSkip={onSkip} />
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
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  useEffect(() => {
    const onOpened = (e: Event) => {
      const ce = e as CustomEvent<{ lat: number; lon: number }>;
      if (!ce.detail) return;
      if (
        Math.abs(ce.detail.lat - V8_TARGET.lat) < V8_TARGET_TOLERANCE &&
        Math.abs(ce.detail.lon - V8_TARGET.lon) < V8_TARGET_TOLERANCE
      ) {
        onDismissRef.current();
      }
    };
    window.addEventListener("mm:popup-opened", onOpened as EventListener);
    return () => window.removeEventListener("mm:popup-opened", onOpened as EventListener);
  }, []);

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

      {/* Caption над пином — Caveat-handwriting, по центру.
          Жирнее (fontWeight 700) + крупнее (80 / 38) — юзер просил. */}
      <div
        style={{
          position: "fixed",
          left: captionX,
          top: captionY,
          transform: "translate(-50%, 0) rotate(-3deg)",
          fontFamily: "var(--font-hand)",
          fontSize: 80,
          fontWeight: 700,
          color: "var(--chanterelle)",
          lineHeight: 1.05,
          whiteSpace: "nowrap",
          animation: "hp-fadeup .45s .1s ease both",
          textShadow: "0 2px 18px rgba(0,0,0,.5)",
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
          top: captionY + 78,
          transform: "translate(-50%, 0) rotate(-2deg)",
          fontFamily: "var(--font-hand)",
          fontSize: 38,
          fontWeight: 600,
          color: "rgba(250,245,232,.95)",
          lineHeight: 1,
          whiteSpace: "nowrap",
          animation: "hp-fadeup .45s .35s ease both",
          textShadow: "0 2px 14px rgba(0,0,0,.6)",
          zIndex: 3,
          pointerEvents: "none",
        }}
      >
        ↓ покажу, что там растёт
      </div>

      <StepBadge n={4} label="точка" onSkip={onSkip} />
    </>
  );
}

/**
 * V9 Info — финальный info-only шаг. Просто стрелка к save-кнопке +
 * пояснение что можно сохранить место, нужен только аккаунт. Без dim,
 * без glow вокруг кнопки. Любой клик где-угодно → done.
 */
function HintV9Info({ onDismiss, onSkip }: { onDismiss: () => void; onSkip: () => void }) {
  const rect = useTargetRect("[data-popup-save]", true);
  const popupRight = useNearbyPanelRight("[data-popup-save]", ".maplibregl-popup", true);
  // Любой клик закрывает шаг — ставим listener на document'е в bubble-фазе
  // (после blocker'а, чтобы блок-клик до нас всё равно дошёл).
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  useEffect(() => {
    const handler = () => onDismissRef.current();
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);
  // Закрытие попапа тоже advance'ит.
  useWindowEvent("mm:popup-closed", onDismiss);

  if (!rect) return null;
  // Без dim, без TargetGlow вокруг save-кнопки. Только arrow + текст.
  return (
    <>
      <ArrowHint
        rect={rect}
        scale={1.8}
        originX={popupRight != null ? popupRight + 24 : undefined}
        title={
          <>
            сохрани <em style={EM}>место</em>
          </>
        }
        sub="нужен только аккаунт →"
        delay={HINT_DELAY}
      />
      {/* Поясняющий банер по центру внизу */}
      <div style={V9_INFO_BANNER}>
        <div style={V9_INFO_TITLE}>
          Можешь сохранять любимые места
        </div>
        <div style={V9_INFO_SUB}>
          Для этого нужно войти в аккаунт.
          <br />
          <span style={V9_INFO_DISMISS_HINT}>клик где угодно — закроет подсказку</span>
        </div>
      </div>
      <StepBadge n={5} label="сохрани" onSkip={onSkip} />
    </>
  );
}

/**
 * LoadingHint — переходный экран между шагами онбординга. Используется
 * после V6 (ждём applied forest pmtiles + colors) и V7 (wetland). Юзер
 * видит затемнённый фон + спиннер + кастомное сообщение. Auto-advance
 * через 2.5 секунды.
 */
function LoadingHint({
  onDone,
  message = "Дождитесь, пока карта загрузится…",
}: {
  onDone: () => void;
  message?: string;
}) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const id = window.setTimeout(() => doneRef.current(), 2500);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(18,16,12,.45)",
          animation: "geobiom-fadein .35s ease both",
          zIndex: 1,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "fixed",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          padding: "20px 28px",
          background: "var(--cream)",
          borderRadius: 14,
          boxShadow:
            "0 14px 36px rgba(20,15,10,.34), 0 0 0 1px rgba(0,0,0,.06)",
          zIndex: 3,
          pointerEvents: "none",
          animation: "hp-fadeup .45s ease both",
        }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 28 28"
          style={{
            animation: "psp-save-spinner 1.1s linear infinite",
            transformOrigin: "center",
          }}
          aria-hidden="true"
        >
          <circle
            cx="14"
            cy="14"
            r="11"
            fill="none"
            stroke="var(--chanterelle)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeDasharray="60"
            strokeDashoffset="30"
          />
        </svg>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 14,
            color: "var(--ink-dim)",
            textAlign: "center",
            letterSpacing: "-0.005em",
          }}
        >
          {message}
        </div>
      </div>
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
  const k = scale;
  const w = typeof window !== "undefined" ? window.innerWidth : 1200;
  const buttonRight = rect.left + rect.width;
  // Якорь, от которого считаем смещения текста. По умолчанию = край
  // кнопки; если задан originX (правая граница подложки/попапа) — берём
  // его, чтобы текст не лез на панель/попап.
  const anchorX = originX != null ? Math.max(originX, buttonRight + 4) : buttonRight + 4;
  const flipLeft = anchorX + 160 * k > w;
  const sign = flipLeft ? -1 : 1;

  const TX = flipLeft ? rect.left - 4 : buttonRight + 4;
  const TY = rect.top + rect.height / 2 + 1;

  // Текст и сабтекст — относительно anchorX. На flipLeft зеркалим
  // знак смещения чтобы текст оказался слева от target'а.
  const textX = flipLeft ? TX - 220 * k : anchorX + 8 * k;
  const textY = TY + 50 * k;
  const subX = flipLeft ? TX - 200 * k : anchorX + 38 * k;
  const subY = TY + 90 * k;

  // Стрелка: start у текста (визуально продолжение «руки писателя»),
  // но не ближе чем 80k от TIP — иначе curve вырождается и arrowhead
  // указывает не туда. На сильно длинных curve'ах start расширяется
  // до anchorX.
  const minSpan = 80 * k;
  const startX = flipLeft
    ? Math.min(textX + 30 * k, TX - minSpan)
    : Math.max(textX - 4 * k, TX + minSpan);
  const startY = TY + 36 * k;
  // Control в 55% от TIP к start — гарантирует tangent в TX в
  // направлении startX (а не в обратную сторону, как было при
  // -10k offset'е на коротких curve'ах). Лёгкий upward bow через ctlY.
  const ctlX = TX + (startX - TX) * 0.55;
  const ctlY = TY - 8 * k;
  const rot = flipLeft ? 5 : -5;
  const subRot = flipLeft ? 4 : -4;
  const dasharray = Math.max(280, Math.hypot(startX - TX, startY - TY) * 1.7);

  // Wings of arrowhead aligned to curve tangent at TX/TY.
  // (ux,uy) — backward direction (от TIP вдоль curve к control'у).
  // Wings = backward rotated ±30°, длиной 16k для жирного arrowhead'а.
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
  const wingLen = 16 * k;
  const [w1x, w1y] = wing(28, wingLen);
  const [w2x, w2y] = wing(-28, wingLen);
  const strokeW = (2.8 * k).toFixed(2);
  // sign unused after refactor — flipLeft branch already handles direction.
  void sign;

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
            // 0.7s (был 1.1s) — стрелка появляется быстрее.
            animation: `hp-draw 0.7s ${delay}s cubic-bezier(.2,.7,.2,1) forwards`,
            // CSS custom property used by keyframe
            ["--len" as string]: dasharray,
          } as React.CSSProperties}
        />
        <g
          style={{
            opacity: 0,
            // Wings fade-in появляются прямо в конце draw'а стрелки —
            // delay = stroke-draw duration (0.7s).
            animation: `geobiom-fadein .2s ${delay + 0.55}s ease forwards`,
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
      {/* Текст появляется раньше: delay = stroke-draw start. Сам fade
          0.4s — быстрее. Юзер просил «текст пораньше». */}
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
          animation: `hp-fadeup .4s ${delay}s ease both`,
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
          animation: `hp-fadeup .4s ${delay + 0.15}s ease both`,
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
          шаг&nbsp;{n}/5
        </span>
        <span style={STEP_BADGE_LABEL}>· {label}</span>
      </div>
      <button
        type="button"
        data-onboarding-control="skip"
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

// Skip-tour pill снизу-по-центру — крупная, чтобы её было невозможно
// пропустить во время первого визита. data-onboarding-control —
// не блокируется глобальным click-блокером.
const SKIP_TOUR_BTN_STYLE: React.CSSProperties = {
  position: "fixed",
  left: "50%",
  bottom: 24,
  transform: "translateX(-50%)",
  zIndex: 5,
  pointerEvents: "auto",
  padding: "14px 28px",
  background: "var(--cream)",
  color: "var(--ink)",
  border: 0,
  borderRadius: 999,
  fontFamily: "var(--font-body)",
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
  boxShadow:
    "0 10px 30px rgba(60,50,30,.28), 0 0 0 1.5px rgba(0,0,0,.08)",
  animation: "hp-fadeup .5s ease both",
};

// «?» help-кнопка — независима от онбординга, рендерится MapHomePage'ом
// всегда. Снизу-СЛЕВА (юзер просил перенести из bottom-right). Сбрасывает
// step на 1 + перезагружает страницу.
const HELP_BTN_STYLE: React.CSSProperties = {
  position: "fixed",
  left: 16,
  bottom: 16,
  zIndex: 5,
  pointerEvents: "auto",
  width: 42,
  height: 42,
  background: "var(--cream)",
  color: "var(--ink-dim)",
  border: 0,
  borderRadius: "50%",
  fontFamily: "var(--font-display)",
  fontSize: 20,
  fontWeight: 600,
  cursor: "pointer",
  boxShadow:
    "0 6px 22px rgba(60,50,30,.18), 0 0 0 1px rgba(0,0,0,.06)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1,
};

// V9 info-баннер по центру внизу — поясняет save-фичу без требования
// её активировать.
const V9_INFO_BANNER: React.CSSProperties = {
  position: "fixed",
  left: "50%",
  bottom: 96,
  transform: "translateX(-50%)",
  zIndex: 4,
  pointerEvents: "none",
  padding: "18px 26px",
  background: "var(--cream)",
  borderRadius: 14,
  boxShadow:
    "0 14px 36px rgba(20,15,10,.32), 0 0 0 1px rgba(0,0,0,.06)",
  textAlign: "center",
  maxWidth: 480,
  animation: "hp-fadeup .45s .05s ease both",
};

const V9_INFO_TITLE: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 22,
  fontWeight: 600,
  letterSpacing: "-0.01em",
  color: "var(--ink)",
  marginBottom: 6,
  lineHeight: 1.2,
};

const V9_INFO_SUB: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 14,
  color: "var(--ink-dim)",
  lineHeight: 1.5,
};

const V9_INFO_DISMISS_HINT: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.04em",
  color: "var(--ink-faint)",
  textTransform: "lowercase",
};
