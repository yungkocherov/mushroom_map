# Mobile design adaptation — bring native app closer to shipped web

Date: 2026-05-18
Status: design approved (scope), pending implementation plan

## Problem

The native app (`apps/mobile`, RN + Expo) drifted from the shipped
web product. Brand tokens (palette/fonts/Logo) are already bridged via
`@mushroom-map/tokens` and reach mobile (verified: onboarding renders
new palette). The remaining divergence is **feature depth and a stale
label**, not theming.

Important correction discovered during audit: the "React ForestPopup
rewrite" and "inline hint-tour onboarding" referenced in older project
memory are NOT in shipped web code. Shipped web uses an HTML-string
MapLibre popup (`apps/web/src/components/mapView/utils/popup.ts` +
`useMapPopup.ts`) and a full-screen onboarding route. The web nav
label settled on **«Мои места»** (not «Споты», not «Точки»). "Closer
to web" means closer to what is live on geobiom.ru.

This effort is **functional adaptation + clean componentization on
tokens only**. Visual polish is a separate Claude Design pass; any
companion mockups here are low-fi wireframes.

## Scope (approved)

In scope (5 items). Out of scope / explicit cuts (3 items).

### 1. ForestPopup data parity

Mobile forest popup (`apps/mobile/components/MapView/` ForestPopup
`Modal`) currently shows only forest attributes + "Виды по биотопу"
(top-5 affinity). Web popup additionally surfaces **soil, water
(distance), terrain (elevation/slope), edibility colour coding, and
season months**.

- Add soil / water / terrain blocks to the mobile popup, matching the
  data web shows. Reuse the same backend endpoints web uses
  (`/api/soil/at`, `/api/water/distance/at`, `/api/terrain/at`; forest
  comes from the tapped feature). Confirm exact endpoints/params from
  `apps/web/src/components/mapView/utils/popup.ts` during planning.
- Apply edibility colour coding to the species list and add the season
  (months) indicator, consistent with web's mapping.
- **Offline-first constraint (mobile-specific design):** forest +
  species must keep working fully offline (already bundled). Soil /
  water / terrain are server-derived and NOT bundled — design the
  popup so these blocks render **when online and degrade gracefully
  when offline** (hidden or "нет сети" placeholder), never blocking
  the always-available forest/species core. This is a deliberate
  divergence from web (web is online-only); it is correct for mobile.
- Componentize: split the popup body into focused sub-components
  (ForestBlock, SoilBlock, WaterBlock, TerrainBlock, SpeciesList)
  behind a single popup container, presentation separated from the
  fetch/loading logic.

### 2. Save-from-popup CTA

Today the only path to save a spot is long-press on the map
(non-discoverable). Add a "Сохранить место" CTA inside ForestPopup
that opens the existing `SaveSpotSheet`, pre-seeding coordinates (and,
where available, the tapped выдел's dominant species → tag suggestion,
see item 4).

### 3. SaveSpot done-state + validation

`apps/mobile/components/SaveSpotSheet.tsx` (uses `@gorhom/bottom-sheet`)
lacks a confirmation state and input validation.

- Add a **done-state** after a successful save (confirmation +
  dismiss / "Мои места" affordance), conceptually matching web.
- Add **name-required validation** with inline error highlight; block
  save until satisfied. Prevents silent failed/empty saves.
- Keep mobile's richer photo capture (camera + gallery) — do not
  regress it to match web.

### 4. Tree-tags filtered by forest legend

In SaveSpotSheet, filter the tree tag dictionary by the species
actually present in the tapped выдел (web V4.4 behaviour) so the form
does not offer tree species absent from that polygon. Falls back to
the full dictionary when species context is unavailable (e.g. saved
via long-press on a no-data area). Shared tag dictionary is
`@mushroom-map/types` spotTags — reuse, do not fork.

### 5. «Споты» → «Мои места» rename

Rename the tab label (`apps/mobile/app/(tabs)/_layout.tsx`), the
screen heading (`apps/mobile/app/(tabs)/spots.tsx`), and empty-state
copy. Pure terminology alignment with shipped web. Verify no code
identifiers depend on the user-facing string.

### Out of scope — explicit cuts (overkill for mobile)

- **Inline hint-tour onboarding overlay** — not even shipped on web;
  the existing 4-slide native wizard works. No change.
- **Sidebar / floating-card map layout port** — phone chrome
  (chip-row / pill-row / round recenter) is appropriate for a phone.
  No layout port; only re-skin chips if a later visual audit shows
  token drift.
- **Full Species catalog/detail re-skin** — mobile list is already
  token-styled and clean; mobile Spot detail (magnetometer compass,
  offline navigator deep-links) is richer than web and must not be
  regressed. No change unless web detail gains substantive new
  content.

## Architecture / boundaries

- **Popup**: one container component owns fetch + loading/offline
  state; pure presentational sub-blocks (Forest/Soil/Water/Terrain/
  Species) receive data via props and are independently renderable.
  Network failures for soil/water/terrain are non-fatal and isolated
  per block.
- **Save flow**: SaveSpotSheet stays the single save surface; popup
  CTA and map long-press are two entry points feeding the same sheet
  with a coords (+ optional species context) payload. Validation and
  done-state are sheet-internal state, not new screens.
- **Shared contracts**: reuse `@mushroom-map/tokens`,
  `@mushroom-map/types` spotTags, and the same API endpoints/response
  shapes web uses. No mobile-only forks of shared vocab. Confirm
  API client typing parity (api-client package) to avoid the
  `res.json()` rename-blind-spot class of bug.

## Testing

- `tsc --noEmit` clean for `apps/mobile`.
- Manual emulator verification (AVD must be ≥4GB RAM — see
  `feedback_mobile_emulator_ram_floor.md`): popup renders all blocks
  online; popup degrades gracefully with network off (forest/species
  still shown); save-from-popup opens sheet with seeded coords; empty
  name blocks save and shows error; done-state appears on success;
  tree tags reflect выдел legend; tab/heading read «Мои места».
- Screenshot each changed surface via `adb exec-out screencap` and
  visually verify before claiming done.

## Risks / open questions for the plan

- Exact soil/water/terrain endpoint params and response fields — pull
  from web `popup.ts` at planning time, not assumed here.
- Offline detection mechanism for the degrade-gracefully behaviour
  (reuse mobile's existing NetInfo / NetworkBanner signal).
- Whether выдел→species context is reliably available at popup time to
  feed the tree-tag filter, or only on explicit feature tap.

## Deliverable of this session

Approved scope + this design doc. Next: `writing-plans` produces the
step-by-step implementation plan. Implementation is a later session.
