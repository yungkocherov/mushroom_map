/**
 * Geobiom logo — H1 Hybrid Classic.
 *
 * Сосна слева + боровик справа от ствола + контурная линия снизу.
 * Source: docs/redesign-2026-05/claude-design/src/d1v2-hybrids.jsx:39-48
 *
 * The mark is built from three primitives:
 *  - HPine: schematic conifer (trunk + triangle layers)
 *  - HBoletus: small mushroom (stem + cap with subtle contour echo)
 *  - HContour: ground contour line (signature of the cap-and-contour
 *    direction — ties the hybrid to the original "A · Cap & Contour")
 *
 * Defaults to var(--forest) and var(--chanterelle) so the logo
 * follows light/dark mode.  Pass explicit hex if rendering on a
 * non-themed surface (e.g. brand mockup, social card).
 *
 * `breathe` enables a slow scale animation (5s) — disabled
 * automatically by `prefers-reduced-motion: reduce`.
 */

type LogoProps = {
  /** Square viewBox edge length in CSS px. Default 56. */
  size?: number;
  /** Stroke/fill color of pine + boletus stem + contour. */
  color?: string;
  /** Cap of the boletus (the warm accent dot of the mark). */
  accent?: string;
  /** Slow breathing animation, disabled via prefers-reduced-motion. */
  breathe?: boolean;
  /** Optional aria-label; defaults to decorative (aria-hidden). */
  ariaLabel?: string;
  className?: string;
};

const DEFAULT_COLOR = "var(--forest)";
const DEFAULT_ACCENT = "var(--chanterelle)";

export function Logo({
  size = 56,
  color = DEFAULT_COLOR,
  accent = DEFAULT_ACCENT,
  breathe = true,
  ariaLabel,
  className,
}: LogoProps) {
  const accessibilityProps = ariaLabel
    ? { role: "img" as const, "aria-label": ariaLabel }
    : { "aria-hidden": true };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      style={{ display: "block" }}
      className={className}
      {...accessibilityProps}
    >
      <g
        style={
          breathe
            ? {
                transformOrigin: "32px 50px",
                animation: "geobiom-breathe 5s ease-in-out infinite",
              }
            : undefined
        }
      >
        {/* Pine — trunk + 3-tier triangle */}
        <rect x={22} y={46} width={4} height={6} fill={color} />
        <path
          d="M24 8 L 12 30 L 18 30 L 8 46 L 40 46 L 30 30 L 36 30 Z"
          fill={color}
        />

        {/* Boletus — stem + cap with contour echo */}
        <g transform="translate(46 44)">
          <path
            d="M-3 0 C -3 5, -4 7, -2.5 8 L 3 8 C 4.5 7, 3.5 5, 3 0 Z"
            fill={color}
          />
          <path
            d="M-7 -1 C -7 -7, -3 -10, 0 -10 C 3 -10, 7 -7, 7 -1 C 7 1, 4 1.5, 0 1.5 C -4 1.5, -7 1, -7 -1 Z"
            fill={accent}
          />
          <path
            d="M-5 -3 Q 0 -7, 5 -3"
            fill="none"
            stroke="rgba(0,0,0,0.2)"
            strokeWidth={0.7}
            strokeLinecap="round"
          />
        </g>

        {/* Topographic ground contours — двойная линия для глубины */}
        <g fill="none" stroke={color} strokeLinecap="round">
          <path
            d="M3.2 55 Q 32 51, 60.8 55"
            strokeWidth={1.6}
            opacity={0.5}
          />
          <path
            d="M11.5 59 Q 32 55, 52.5 59"
            strokeWidth={1.1}
            opacity={0.275}
          />
          <path
            d="M14 60 Q 32 56, 50 60"
            strokeWidth={1}
            opacity={0.25}
          />
        </g>
      </g>
    </svg>
  );
}
