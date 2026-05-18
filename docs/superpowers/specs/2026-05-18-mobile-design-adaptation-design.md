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
  data web shows. **Verified constraint:** the shared
  `@mushroom-map/api-client` is NOT React-Native-safe — it resolves
  base URL via `import.meta.env.VITE_API_URL`, which Metro/Hermes does
  not support (the package header itself defers an RN baseUrl factory
  to "when the mobile app arrives"). Mobile already has an RN-safe
  `apps/mobile/services/api.ts` (`getApiBaseUrl()`) and currently
  reads forest only from MVT tile properties, never the API. Therefore:
  - **Reuse the shared response *types* `@mushroom-map/types`**
    (`ForestAtResponse`, `SoilAtResponse`, `WaterDistanceResponse`,
    `TerrainAtResponse`, `SpeciesRef`, `Edibility`) as the contract —
    do NOT redefine shapes mobile-side (this is what prevents the
    `res.json()` rename-blind-spot bug class).
  - Add thin mobile fetchers in `apps/mobile/services/` built on the
    existing `getApiBaseUrl()`, returning those shared types, calling
    `/api/forest/at`, `/api/soil/at`, `/api/water/distance/at`,
    `/api/terrain/at` (verified to exist) — mirroring web
    `useMapPopup.ts`: one `Promise.all`, forest required, soil/water/
    terrain each wrapped `.catch(() => null)`.
  - The tapped-feature handler currently has only a screen point +
    tile props (no lat/lon). It must obtain tap coordinates (same way
    `onLongPress` reads `feature.geometry.coordinates`) to call the
    API. Forest API also yields `species_theoretical` (with
    `edibility` + `season_months`) — use it when online; keep the
    existing bundled offline-affinity ("Виды по биотопу") as the
    offline fallback species source.
- Apply edibility colour coding to the species list and add the season
  (months) indicator, consistent with web's mapping.
- **Offline-first constraint (mobile-specific design):** forest +
  species must keep working fully offline (already bundled). Soil /
  water / terrain are server-derived and NOT bundled. Web already
  degrades per-source via `.catch(() => null)`; mobile mirrors that
  pattern — each block renders when its fetch succeeds (online) and is
  **hidden / "нет сети" placeholder** on failure or offline, never
  blocking the always-available forest/species core. Web tolerates
  this only incidentally (web is online-only); on mobile it is a
  first-class designed state.
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

### 4. Tree-tags filtered by tapped выдел species

Mobile-side enhancement (NOT a web port — verified that shipped web's
SaveSpot form does NOT filter tags by выдел; web's `legendFilter` is a
map-layer render filter, unrelated). In SaveSpotSheet, when the save
originates from a forest выдел with known species
(dominant + `species_composition`), filter the tree tag dictionary to
those species so the form does not offer tree species absent from that
polygon. **Falls back to the full dictionary** whenever species
context is unavailable (long-press on no-data area, or popup with
failed forest fetch). Shared tag dictionary is `@mushroom-map/types`
spotTags — reuse, do not fork.

### 5. «Споты» → «Мои места» rename

Align all user-facing "спот" terminology with shipped web («Мои
места»). Verified exact strings to change (only `options.title` /
display strings, no code identifiers):
- `apps/mobile/app/(tabs)/_layout.tsx` L21 `title: "Споты"` → `"Мои
  места"` (expo-router uses it as the tab label).
- `apps/mobile/app/(tabs)/spots.tsx` L172 heading `Споты`; L258
  empty-state `Спотов пока нет…`.
- `apps/mobile/components/SaveSpotSheet.tsx` L158 sheet title
  `Сохранить спот` → e.g. `Сохранить место`.
Also fix the **stale empty-state copy** at spots.tsx L258 ("Тапни
оранжевую кнопку на карте…" — no such button exists; save is
long-press, and item 2 adds a popup CTA): reword to reference the
real save paths (tap a выдел → «Сохранить место», or long-press the
map). This bullet's reword must stay consistent with item 2's CTA
label.

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
  `@mushroom-map/types` (spotTags AND the popup response interfaces
  `ForestAtResponse`/`SoilAtResponse`/`WaterDistanceResponse`/
  `TerrainAtResponse`/`SpeciesRef`/`Edibility`). New mobile fetchers
  live in `apps/mobile/services/` on the existing RN-safe
  `getApiBaseUrl()` and return those shared types verbatim. `@mushroom-
  map/api-client` is NOT consumed (RN-incompatible — see item 1). No
  mobile-only forks of shared shapes.

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

- RESOLVED: `@mushroom-map/api-client` is NOT RN-safe (`import.meta`);
  decision is mobile-side fetchers + shared `@mushroom-map/types`
  (see item 1 / Architecture). No open question remains here.
- Offline behaviour can lean on per-source `.catch(() => null)` (same
  as web) rather than an explicit NetInfo gate; confirm whether an
  explicit offline signal (existing NetworkBanner / NetInfo) gives a
  better placeholder UX than a silent failed fetch.
- Whether the tapped выдел's species (dominant + composition) is
  carried into the SaveSpot payload at popup-save time, or only the
  coordinates — determines whether item 4's filter has input or always
  falls back.

## Deliverable of this session

Approved scope + this design doc. Next: `writing-plans` produces the
step-by-step implementation plan. Implementation is a later session.
