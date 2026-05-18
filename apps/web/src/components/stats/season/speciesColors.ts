/**
 * Canonical mushroom-group → colour binding. ONE source of truth so the
 * same species reads the same colour everywhere (project-wide rule, user
 * 2026-05-18). Values are CSS-var tokens (--sp-*, defined in
 * @mushroom-map/tokens) so the Claude Design pass re-tunes hues without
 * touching chart logic. Keys are the season group_key vocabulary
 * (SEASON_GROUP_KEYS + "other"); see CLAUDE.md GROUP_TO_SLUGS.
 */
export const SPECIES_COLOR: Record<string, string> = {
  porcini: "var(--sp-porcini)",
  aspen_bolete: "var(--sp-aspen)",
  pine_bolete: "var(--sp-pine-bolete)",
  chanterelle: "var(--sp-chanterelle)",
  fly_agaric: "var(--sp-fly-agaric)",
  spring_mushroom: "var(--sp-spring)",
  honey_fungus: "var(--sp-honey)",
  other: "var(--sp-other)",
};

/** Colour for a group key; unknown keys fall back to the neutral token. */
export function speciesColor(key: string): string {
  return SPECIES_COLOR[key] ?? "var(--sp-other)";
}
