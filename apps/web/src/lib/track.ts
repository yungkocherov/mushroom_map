// Type-safe wrapper around Umami's global track API.
//
// No-ops if Umami hasn't loaded yet (script blocked by adblock, env
// vars not set at build time, dev mode without analytics, etc).
// Analytics MUST never break UX.
//
// Add new event types to UmamiEvents below. Naming convention:
//   `area.action` (dot-namespace) — group by area in Umami UI.
// Event payloads must contain ZERO PII: no usernames, no spot
// coordinates, no search query text. Use length/boolean/slug only.

declare global {
  interface Window {
    umami?: {
      track: (event: string, data?: Record<string, unknown>) => void;
    };
  }
}

export type UmamiEvents = {
  "layer.toggle":     { layer: string; visible: boolean };
  "spot.save":        { has_rating: boolean; tag_count: number };
  "species.open":     { slug: string };
  "district.open":    { name: string };
  "spotlight.search": { query_length: number };
};

export function track<K extends keyof UmamiEvents>(
  event: K,
  data: UmamiEvents[K],
): void {
  try {
    window.umami?.track(event, data);
  } catch {
    // Swallow — analytics is best-effort.
  }
}
