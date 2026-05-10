/**
 * IndexMeter — animated forecast bar (число + сегменты).
 *
 * Source: docs/redesign-2026-05/claude-design/src/d1v2.jsx:215-250
 *
 * Animates from 0 → value over ~1.1s on mount + on value change. Uses
 * requestAnimationFrame, cleanup'нется на unmount. Bar segments
 * animate with staggered delay (Apple-tile feel). Respect for
 * prefers-reduced-motion is provided by the global animation rule in
 * `animations.css` (transition-duration → 0).
 */

import { useEffect, useState } from "react";

type IndexMeterProps = {
  /** 0..1 fraction. Renders as `value.toFixed(2)` (e.g. 0.78). */
  value: number;
  /** Number of bar segments. Default 14. */
  total?: number;
  /** Larger variant for hero / right panel. */
  big?: boolean;
  /** Optimised for dark surfaces (lighter ink). */
  dark?: boolean;
  /** Override default "индекс плодоношения" caption. */
  label?: string;
};

export function IndexMeter({
  value,
  total = 14,
  big = false,
  dark = false,
  label = "индекс плодоношения",
}: IndexMeterProps) {
  const [n, setN] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const dur = 1100;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setN(eased);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  const filled = Math.floor(value * total);
  const display = (value * n).toFixed(2);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: big ? 64 : 48,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            color: dark ? "var(--cream)" : "var(--forest)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {display}
        </div>
        <div
          style={{
            fontSize: 13,
            color: dark
              ? "rgba(250,245,232,0.7)"
              : "var(--ink-dim)",
          }}
        >
          {label}
        </div>
      </div>
      <div style={{ display: "flex", gap: 2, height: big ? 28 : 22 }}>
        {Array.from({ length: total }).map((_, i) => {
          const on = i < filled;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: "100%",
                borderRadius: 1,
                background: on
                  ? "var(--moss)"
                  : dark
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(0,0,0,0.08)",
                opacity: on ? 0.45 + (i / total) * 0.55 * n : 1,
                transform: on
                  ? `scaleY(${0.5 + 0.5 * n})`
                  : "scaleY(1)",
                transformOrigin: "bottom",
                transition: `transform 0.6s ${i * 0.04}s cubic-bezier(0.2,0.7,0.2,1)`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
