/**
 * Design tokens as typed constants.
 *
 * Mirrors values defined in ./tokens.css. The CSS is for the web
 * (consumed via `@mushroom-map/tokens/tokens.css`). These constants
 * are for non-CSS consumers — React Native (mobile), canvas / SVG
 * chart drawing, generated theme previews, etc.
 *
 * Refresh 2026-05: Geobiom rebrand (D1 v2 — refined organic).
 *   See docs/redesign-2026-05/plan.md §2 for token map.
 *
 * When you change a value, change it in BOTH places. A future task
 * may replace one of them with code-gen from the other; until then,
 * hand-sync.
 */

export const palette = {
  light: {
    paper: "#f4ede0",
    paperRise: "#ede4d2",
    cream: "#faf5e8",
    ink: "#2a2620",
    inkDim: "#5b5346",
    inkFaint: "#8a8270",
    rule: "rgba(0, 0, 0, 0.08)",

    forest: "#3e4827",
    forestDeep: "#2a3019",
    moss: "#5d6a3a",
    birch: "#e0d8c2",

    chanterelle: "#b86a3a",
    amberDeep: "#9a5a30",
    bark: "#7a5a3a",

    danger: "#8b2a2a",
    caution: "#855410",

    focusRing: "#b86a3a",

    // Forecast index 0–5 scale
    idx0: "#4a6b40",
    idx1: "#5e8050",
    idx2: "#9bb47a",
    idx3: "#bcc890",
    idx4: "#b86a3a",
  },
  dark: {
    paper: "#1a1812",
    paperRise: "#232017",
    cream: "#2d2820",
    ink: "#ede4d2",
    inkDim: "#b6ad96",
    inkFaint: "#8a826f",
    rule: "rgba(255, 255, 255, 0.08)",

    forest: "#8aa362",
    forestDeep: "#a4ba80",
    moss: "#9bb785",
    birch: "#2d2820",

    chanterelle: "#d88c5a",
    amberDeep: "#e8a070",
    bark: "#b08868",

    danger: "#d05252",
    caution: "#dfa25c",

    focusRing: "#d88c5a",

    // Forecast index 0–5 scale (dark mode)
    idx0: "#6b8a5e",
    idx1: "#7da068",
    idx2: "#a9c290",
    idx3: "#cdd8a3",
    idx4: "#d88c5a",
  },
} as const;

export const typography = {
  fontDisplay:
    '"Fraunces Variable", "Fraunces", Georgia, "Times New Roman", serif',
  fontBody:
    '"Inter Variable", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif',
  fontMono: '"IBM Plex Mono", "JetBrains Mono", Menlo, Consolas, monospace',
  fontHand: '"Caveat", "Fraunces Variable", "Fraunces", cursive',
} as const;

export const fontSize = {
  hero: "clamp(2.75rem, 5vw + 1rem, 5.5rem)",  // 44 → 88px
  display: "clamp(2rem, 3vw + 1rem, 4rem)",     // 32 → 64px
  h1: "2.25rem",
  h2: "1.5rem",
  h3: "1.25rem",
  lg: "1.125rem",
  body: "1rem",
  sm: "0.875rem",
  xs: "0.75rem",
} as const;

export const lineHeight = {
  tight: 1.15,
  normal: 1.55,
  long: 1.7,
} as const;

export const spacing = {
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.5rem",
  6: "2rem",
  7: "3rem",
  8: "4rem",
  9: "6rem",
} as const;

export const radius = {
  xs: "2px",
  sm: "4px",
  md: "8px",
  lg: "12px",
  xl: "16px",
  pill: "9999px",
} as const;

export const shadow = {
  light: {
    "1": "0 1px 2px rgba(0, 0, 0, 0.04)",
    "2": "0 4px 16px rgba(60, 50, 30, 0.10)",
    "3": "0 12px 32px rgba(60, 50, 30, 0.18)",
    card: "0 6px 22px rgba(60, 50, 30, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05)",
    focus: "0 0 0 3px rgba(184, 106, 58, 0.35)",
  },
  dark: {
    "1": "0 1px 2px rgba(0, 0, 0, 0.35)",
    "2": "0 4px 16px rgba(0, 0, 0, 0.45)",
    "3": "0 12px 32px rgba(0, 0, 0, 0.55)",
    card: "0 6px 22px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.06)",
    focus: "0 0 0 3px rgba(216, 140, 90, 0.40)",
  },
} as const;

export const logo = {
  primary: "LogoHybrid1",
  defaultSize: { sm: 24, md: 36, lg: 56, xl: 96 },
  defaultPadding: 0.25, // safe area = 1/4 of mark height
} as const;

export type PaletteLight = typeof palette.light;
export type PaletteDark = typeof palette.dark;
export type PaletteKey = keyof PaletteLight;
