/**
 * Pill — toggleable rounded button (используется в AddSpot, Onboarding,
 * Calendar для tag/district выбора).
 *
 * Source: docs/redesign-2026-05/claude-design/src/d1v2-suite.jsx:6-11
 */

import type { ReactNode } from "react";

type PillProps = {
  on: boolean;
  onToggle: () => void;
  children: ReactNode;
  ariaLabel?: string;
  /** Override default font family (e.g. mono for tag categories). */
  fontFamily?: string;
};

export function Pill({ on, onToggle, children, ariaLabel, fontFamily }: PillProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={ariaLabel}
      className="btn-interactive"
      style={{
        padding: "8px 14px",
        fontSize: 13,
        background: on ? "var(--forest)" : "transparent",
        color: on ? "var(--cream)" : "var(--ink)",
        border: on
          ? "1px solid var(--forest)"
          : "1px solid rgba(0,0,0,0.16)",
        borderRadius: "var(--radius-pill)",
        fontFamily: fontFamily ?? "var(--font-body)",
        cursor: "pointer",
        transition: "all 0.2s",
      }}
    >
      {children}
    </button>
  );
}
