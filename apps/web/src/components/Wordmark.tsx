/**
 * Geobiom wordmark — лого + название + опциональный подзаголовок.
 *
 * Используется в Header, on-Dark/on-Cream surfaces, brand guide.
 * Source: docs/redesign-2026-05/claude-design/src/d1v2.jsx:92-105
 */

import { Logo } from "./Logo";

type WordmarkSize = "sm" | "md" | "lg";

type WordmarkProps = {
  size?: WordmarkSize;
  /** Show "лес ленобласти" subtitle. Default true for md/lg, false for sm. */
  showSub?: boolean;
  /** Override the title text (default "Geobiom"). */
  title?: string;
  /** Override the subtitle text (default "лес ленобласти"). */
  sub?: string;
  /** Pass through to the inner Logo. */
  color?: string;
  accent?: string;
  /** Disable breathe animation on the mark. */
  noBreathe?: boolean;
};

const SIZES: Record<WordmarkSize, { mark: number; ttl: string; sub: string; gap: string }> = {
  sm: { mark: 24, ttl: "1rem", sub: "0.625rem", gap: "0.5rem" },
  md: { mark: 36, ttl: "1.375rem", sub: "0.6875rem", gap: "0.75rem" },
  lg: { mark: 56, ttl: "2.125rem", sub: "0.8125rem", gap: "1.125rem" },
};

export function Wordmark({
  size = "md",
  showSub,
  title = "Geobiom",
  sub = "лес ленобласти",
  color,
  accent,
  noBreathe,
}: WordmarkProps) {
  const s = SIZES[size];
  const renderSub = showSub ?? size !== "sm";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: s.gap,
        lineHeight: 1,
      }}
    >
      <Logo
        size={s.mark}
        color={color}
        accent={accent}
        breathe={!noBreathe}
      />
      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: s.ttl,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "var(--ink)",
          }}
        >
          {title}
        </span>
        {renderSub && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: s.sub,
              color: "var(--ink-dim)",
              marginTop: 4,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {sub}
          </span>
        )}
      </span>
    </span>
  );
}
