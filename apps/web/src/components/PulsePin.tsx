/**
 * PulsePin — animated marker (pin + double pulse ring + optional label).
 *
 * Source: docs/redesign-2026-05/claude-design/src/d1v2.jsx:253-260
 *
 * Standalone DOM component (CSS animation, no map projection). For
 * placement over a MapLibre map see `mapView/PulsePinOverlay.tsx`
 * (Phase W6) — that variant subscribes to `move` and re-projects.
 */

type PulsePinProps = {
  color?: string;
  size?: number;
  /** Phase offset for the pulse animation (s). Used to stagger
   *  multiple pins so they don't pulse in lockstep. */
  delay?: number;
  /** Optional Caveat-styled label below the pin. */
  label?: string;
};

export function PulsePin({
  color = "var(--chanterelle)",
  size = 12,
  delay = 0,
  label,
}: PulsePinProps) {
  const half = size / 2;
  const ringStyle = {
    position: "absolute" as const,
    left: "50%",
    top: "50%",
    width: size,
    height: size,
    marginLeft: -half,
    marginTop: -half,
    borderRadius: "50%",
    border: `2px solid ${color}`,
  };
  return (
    <div style={{ position: "relative" }}>
      <span
        style={{
          ...ringStyle,
          animation: `geobiom-pulse 2.4s ${delay}s ease-out infinite`,
        }}
      />
      <span
        style={{
          ...ringStyle,
          animation: `geobiom-pulse 2.4s ${delay + 0.6}s ease-out infinite`,
          opacity: 0.6,
        }}
      />
      <span
        style={{
          position: "relative",
          display: "block",
          width: size,
          height: size,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 0 3px ${color}33, 0 2px 6px rgba(0,0,0,0.25)`,
        }}
      />
      {label && (
        <div
          style={{
            position: "absolute",
            top: size + 6,
            left: "50%",
            transform: "translateX(-50%)",
            fontFamily: "var(--font-hand)",
            fontSize: 16,
            color: "var(--ink)",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}
