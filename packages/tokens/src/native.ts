/**
 * React Native variant of design tokens.
 *
 * RN uses unit-less numbers (interpreted as density-independent pixels),
 * not CSS rem/px strings. This file re-exports `palette` from index.ts as-is
 * and converts size scales to numbers (1rem = 16dp).
 */

import { palette, typography } from "./index";

export { palette, typography };

export const fontSize = {
  display: 42,
  h1: 32,
  h2: 24,
  h3: 20,
  lg: 18,
  body: 16,
  sm: 14,
  xs: 12,
} as const;

export const lineHeight = {
  tight: 1.15,
  normal: 1.55,
  long: 1.7,
} as const;

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 48,
  8: 64,
  9: 96,
} as const;

export const radius = {
  xs: 2,
  sm: 4,
  md: 8,
  lg: 12,
  pill: 9999,
} as const;
