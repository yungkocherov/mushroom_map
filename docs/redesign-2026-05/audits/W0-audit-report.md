# Phase W0 — Pre-flight audit results

Run date: 2026-05-10. All 7 audits completed before W1 token swap.

## A0.1 — Hardcoded hex colors (web)

168 occurrences across 30 files. Most are **semantic data colors** (порода
коры for forest layers, district colors, status badges), not theme
tokens — kept as-is.

**Theme-related occurrences requiring migration:**

| File | Issue | Action |
|---|---|---|
| `apps/web/src/components/mapView/BaseMapPicker.module.css` | non-inline variant has `#888`/`#666`/`#222`/`white` | non-inline variant is unused (inline via LayerGrid); deprecated, removed in W4 |
| `apps/web/src/components/mapView/MapOverlays.module.css` | `#2e7d32` (forest hint toast bg) | migrate to `var(--forest)` — semantic green, should follow theme |
| `apps/web/src/components/mapView/MapOverlays.module.css` | `#323232`, `#c62828`, `#333` toast text/bg | semantic accent colors (notification/error), keep as-is |
| `apps/web/src/components/mapView/CursorReadout.module.css` | 1 hex | inspect during W4 polish; if theme — migrate |

All other 30+ files use hex either inside `forestStyle.ts` SPECIES_COLORS
(intentional — bark colors, palette decision Phase W1) or `spotRating.ts`
RATING_COLORS (legacy — to be reviewed against new chanterelle/terra
palette in W6).

## A0.2 — rgba/hsl audit

53 occurrences across 22 files. All are **shadow/transparency overlays**
(`rgba(0,0,0,0.06)` etc.) — these stay as raw rgba because they apply on
top of variable backgrounds. ✓ Acceptable.

## A0.3 — Sidebar dependents

Result: **only 1 file** imports sidebar components:

```
apps/web/src/routes/MapHomePage.tsx:27: import { Sidebar } from "../components/sidebar/Sidebar";
```

→ ✓ Phase W4 sidebar removal is **safe**. No cross-route consumers.

## A0.4 — JetBrains Mono dependents

Tokenized usage via `var(--font-mono)` is dominant (40+ occurrences in
`.module.css` + inline styles). Token swap in `tokens.css` will
auto-migrate all of these.

**Direct package references** (need explicit removal in W1):
- `apps/web/package.json:17` — dependency
- `apps/web/src/main.tsx:10` — import statement
- `package-lock.json` — auto-updated

**Documentation references** (historical, leave as-is):
- `docs/mobile-app-2026-05.md:127, 411`
- `docs/redesign-2026-04.md` (multiple)
- `docs/archive/*`

→ ✓ Safe to remove. No code consumer outside `var(--font-mono)`.

## A0.5 — Mobile hardcoded colors

**Only 1 file** in `apps/mobile/`: `components/MapView/style.ts` —
`SPECIES_COLORS` object with bark-tone hex per species (intentionally
non-green for satellite contrast, mirrors web `forestStyle.ts`).

→ ✓ Acceptable as-is. Species-specific bark palette is a design
decision, not theme. Sync remains via shared `forestStyle.ts` contract.

Mobile palette consumption goes through `@mushroom-map/tokens/native`
which re-exports from `index.ts`. Token swap propagates.

## A0.6 — services/observability consumers

GlitchTip + Umami self-hosted dashboards have their own theming, do NOT
consume `@mushroom-map/tokens`. → ✓ Out of scope.

## A0.7 — Supply chain audit

Verified via Fontsource API + npm registry:

| Package | npm version | License | Last updated | Cyrillic | Result |
|---|---|---|---|---|---|
| `@fontsource/caveat` | `5.2.8` | OFL-1.1 | 2025-09-05 | ✓ `cyrillic` + `cyrillic-ext` subsets | ✅ |
| `@fontsource/ibm-plex-mono` | `5.2.7` | OFL-1.1 | 2025-09-16 | ✓ `cyrillic` + `cyrillic-ext` subsets | ✅ |

Maintainer: `fontsource` org (verified). Fresh updates within 12 months.
Open license. No CVEs noted.

→ ✓ Cleared for W1 install.

## A0.2-extended — Cyrillic font support

Both new fonts have Cyrillic via `unicodeRange` `U+0400-045F` etc. Caveat
specifically covers Russian alphabet. Plan §2.3 mitigation valid:
import via subset paths (e.g. `@fontsource/caveat/cyrillic-400.css`)
to avoid latin-only fallback for handwritten accents.

Existing Fraunces (`@fontsource-variable/fraunces`) supports Cyrillic —
verified by checking current `/methodology` MDX articles which render
Russian text correctly today.

## Verdict

✅ **W1 unblocked.** No blockers; all migrations during W1 are
mechanical with confirmed no-cross-impact.

**Per-fix list to bundle into W1 commit:**
1. `MapOverlays.module.css` `#2e7d32` → `var(--forest)`
2. (Phase W4 will handle BaseMapPicker non-inline variant removal +
   CursorReadout inspection.)

Other findings are notes for downstream phases or accepted as-is.
