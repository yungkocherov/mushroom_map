/**
 * Design tokens as typed constants.
 *
 * Mirrors values defined in ./tokens.css. The CSS is for the web
 * (consumed via `@mushroom-map/tokens/tokens.css`). These constants
 * are for non-CSS consumers — future React Native app, canvas / SVG
 * chart drawing, generated theme previews, etc.
 *
 * When you change a value, change it in BOTH places. A future task
 * may replace one of them with code-gen from the other; until then,
 * hand-sync.
 */

export const palette = {
  light: {
    paper: "#f5f1e6",
    paperRise: "#fcf9f0",
    ink: "#20241e",
    inkDim: "#6b6a5e",
    inkFaint: "#a5a295",
    rule: "#d8d2c0",

    forest: "#2d5a3a",
    forestDeep: "#1a3a24",
    moss: "#7a9b64",
    birch: "#e8e2d1",

    chanterelle: "#d88c1e",
    amberDeep: "#a86b0f",

    danger: "#8b2a2a",
    caution: "#c07a2c",

    focusRing: "#d88c1e",
  },
  dark: {
    paper: "#171913",
    paperRise: "#1f221b",
    ink: "#e4dfd0",
    inkDim: "#93907f",
    inkFaint: "#5f5d52",
    rule: "#2b2e23",

    forest: "#72b07e",
    forestDeep: "#8fc395",
    moss: "#9bb785",
    birch: "#2b2e23",

    chanterelle: "#f3a435",
    amberDeep: "#e8941f",

    danger: "#d05252",
    caution: "#dfa25c",

    focusRing: "#f3a435",
  },
} as const;

export const typography = {
  fontDisplay:
    '"Fraunces Variable", "Fraunces", Georgia, "Times New Roman", serif',
  fontBody:
    '"Inter Variable", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif',
  fontMono: '"JetBrains Mono", Menlo, Consolas, monospace',
} as const;

export const fontSize = {
  display: "2.625rem",
  h1: "2rem",
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
  pill: "9999px",
} as const;

export const shadow = {
  light: {
    "1": "0 1px 2px rgba(0, 0, 0, 0.04)",
    "2": "0 4px 16px rgba(0, 0, 0, 0.06)",
    "3": "0 12px 32px rgba(0, 0, 0, 0.10)",
    focus: "0 0 0 3px rgba(216, 140, 30, 0.35)",
  },
  dark: {
    "1": "0 1px 2px rgba(0, 0, 0, 0.35)",
    "2": "0 4px 16px rgba(0, 0, 0, 0.45)",
    "3": "0 12px 32px rgba(0, 0, 0, 0.55)",
    focus: "0 0 0 3px rgba(243, 164, 53, 0.40)",
  },
} as const;

export type PaletteLight = typeof palette.light;
export type PaletteDark = typeof palette.dark;
export type PaletteKey = keyof PaletteLight;
