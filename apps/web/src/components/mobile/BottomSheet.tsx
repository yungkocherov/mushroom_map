/**
 * BottomSheet — мобильная нижняя шторка с тремя snap-высотами
 * (peek / half / full). По spec'у redesign-2026-04 заменяет
 * MapLibre-попап выдела на ≤768px (интеграция — отдельный шаг,
 * связан с MapView decomposition).
 *
 * Жесты: `@use-gesture/react` (useDrag), анимации:
 * `@react-spring/web` (spring-based translateY). Касание ручки или
 * любого места sheet'а тащит. Если drag-velocity вниз превышает
 * порог — закрываем; иначе snap'аем к ближайшей высоте.
 *
 * Высоты в долях от viewport-height:
 *   peek  — 0.18  (заголовок выдела + 1–2 строки)
 *   half  — 0.55  (основные mono-поля + виды по биотопу)
 *   full  — 0.92  (полное содержимое + «Где этот вид встречается рядом»)
 */
import { useDrag } from "@use-gesture/react";
import { animated, useSpring } from "@react-spring/web";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./BottomSheet.module.css";

export type BottomSheetSnap = "peek" | "half" | "full";

export interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Начальная высота при открытии. По умолчанию 'half'. */
  initialSnap?: BottomSheetSnap;
  snap?: BottomSheetSnap;
  onSnapChange?: (snap: BottomSheetSnap) => void;
  children?: ReactNode;
  className?: string;
  /** ARIA label для sheet'а (попап-заголовок выдела, etc.). */
  ariaLabel?: string;
}

const SNAP_FRAC: Record<BottomSheetSnap, number> = {
  peek: 0.18,
  half: 0.55,
  full: 0.92,
};

const ORDER: BottomSheetSnap[] = ["peek", "half", "full"];

/** Velocity threshold в px/ms — выше => считаем «решительный свайп». */
const FLICK_VELOCITY = 0.5;

function useViewportHeight(): number {
  const [vh, setVh] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 800,
  );
  useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return vh;
}

export function BottomSheet({
  open,
  onOpenChange,
  initialSnap = "half",
  snap: controlledSnap,
  onSnapChange,
  children,
  className,
  ariaLabel,
}: BottomSheetProps) {
  const vh = useViewportHeight();
  const [internalSnap, setInternalSnap] = useState<BottomSheetSnap>(initialSnap);
  const isControlled = controlledSnap !== undefined;
  const snap = isControlled ? controlledSnap : internalSnap;
  const setSnap = (v: BottomSheetSnap) => {
    if (!isControlled) setInternalSnap(v);
    onSnapChange?.(v);
  };

  // Sheet полная высота (height в CSS = 92vh). translateY=0 → full,
  // translateY=vh*(1 - peek_frac) → peek; translateY=vh → закрыт.
  const FULL_TY = 0; // sheet виден на всю высоту 92vh
  const HALF_TY = vh * (SNAP_FRAC.full - SNAP_FRAC.half);
  const PEEK_TY = vh * (SNAP_FRAC.full - SNAP_FRAC.peek);
  const CLOSED_TY = vh; // полностью за нижней границей

  const targetTy = useMemo(() => {
    if (!open) return CLOSED_TY;
    return snap === "full" ? FULL_TY : snap === "half" ? HALF_TY : PEEK_TY;
  }, [open, snap, FULL_TY, HALF_TY, PEEK_TY, CLOSED_TY]);

  const [{ y }, api] = useSpring(() => ({
    y: CLOSED_TY,
    config: { tension: 280, friction: 32 },
  }));

  useEffect(() => {
    api.start({ y: targetTy });
  }, [targetTy, api]);

  const bind = useDrag(
    ({ last, velocity: [, vy], direction: [, dy], movement: [, my], cancel }) => {
      if (!open) {
        cancel();
        return;
      }
      // Текущая база (target) + смещение пальца. Не пускаем выше full
      // (отрицательно — резиновое сопротивление через clamp у springs тут
      // не нужно; просто не даём дёрнуть выше FULL_TY).
      const base = targetTy;
      const next = Math.max(FULL_TY, base + my);
      if (!last) {
        api.start({ y: next, immediate: true });
        return;
      }
      // last (отпустил) — решаем куда снапать.
      const flickDown = vy > FLICK_VELOCITY && dy > 0;
      const flickUp = vy > FLICK_VELOCITY && dy < 0;

      const candidates: { snap: BottomSheetSnap; ty: number }[] = [
        { snap: "full", ty: FULL_TY },
        { snap: "half", ty: HALF_TY },
        { snap: "peek", ty: PEEK_TY },
      ];

      if (flickDown && snap === "peek") {
        // решительный свайп вниз с peek → закрытие
        onOpenChange(false);
        return;
      }
      if (flickDown) {
        // спускаемся на одну ступень
        const idx = ORDER.indexOf(snap);
        const lower = ORDER[Math.max(0, idx - 1)];
        setSnap(lower);
        return;
      }
      if (flickUp) {
        const idx = ORDER.indexOf(snap);
        const higher = ORDER[Math.min(ORDER.length - 1, idx + 1)];
        setSnap(higher);
        return;
      }
      // не «флик» — снапаем к ближайшему
      let best = candidates[0];
      for (const c of candidates) {
        if (Math.abs(c.ty - next) < Math.abs(best.ty - next)) best = c;
      }
      setSnap(best.snap);
    },
    {
      from: () => [0, y.get()],
      filterTaps: true,
      pointer: { touch: true },
    },
  );

  if (typeof document === "undefined") return null;
  if (!open && y.get() >= CLOSED_TY - 1) {
    // полностью спрятана — не рендерим, чтобы не мешать tab-нав'у
    return null;
  }

  return createPortal(
    <>
      <div
        className={styles.backdrop}
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      <animated.div
        className={`${styles.sheet}${className ? ` ${className}` : ""}`}
        style={{ y }}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? "Информация"}
      >
        <div {...bind()} className={styles.handleWrap}>
          <div className={styles.handle} aria-hidden="true" />
        </div>
        <div className={styles.body}>{children}</div>
      </animated.div>
    </>,
    document.body,
  );
}
