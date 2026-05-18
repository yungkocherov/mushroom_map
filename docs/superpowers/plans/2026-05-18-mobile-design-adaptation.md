# Mobile Design Adaptation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the native app's forest popup and save-spot flow to feature parity with shipped web, plus terminology alignment, without regressing mobile-only strengths.

**Architecture:** ForestPopup becomes a thin container that fetches forest/soil/water/terrain via new RN-safe mobile fetchers (built on existing `getApiBaseUrl()`, returning shared `@mushroom-map/types` shapes) and renders focused presentational sub-blocks; soil/water/terrain degrade per-source when offline. SaveSpotSheet gains name validation, a done-state, and species-aware tree-tag filtering, reachable from a new in-popup CTA.

**Tech Stack:** React Native + Expo (apps/mobile), `@mushroom-map/types`, `@mushroom-map/tokens/native`, `@gorhom/bottom-sheet`, maplibre-react-native. No RN unit-test runner exists in this repo — verification is `tsc --noEmit` + manual emulator screenshot (AVD must be ≥4 GB RAM; see `memory/feedback_mobile_emulator_ram_floor.md`). Pure logic is extracted into side-effect-free functions so it is correct by inspection.

**Spec:** `docs/superpowers/specs/2026-05-18-mobile-design-adaptation-design.md`

---

## Reference: verified current shapes (do not re-discover)

- `apps/mobile/components/MapView/ForestPopup.tsx` (239 L): `export type ForestFeatureProps = { dominant_species?, bonitet?, age_group?, age?, source? }`; `Props = { visible, feature: ForestFeatureProps|null, onClose }`. No fetch — derives "Виды по биотопу" from bundled `services/affinity.ts:topSpeciesForForestType(dominant_species,5)`. Modal slide-up + ScrollView.
- `apps/mobile/components/MapView/SpikeMap.tsx` (560 L): state `popupFeature` (L74), `saveSpotOpen`/`saveSpotCoords` (L75-76). `onPress` (L240-258) does `queryRenderedFeaturesAtPoint` → `setPopupFeature(hit.properties)`. `onLongPress` (L224-234) reads `feature.geometry.coordinates` → `setSaveSpotCoords({lon,lat})` + `setSaveSpotOpen(true)`. ForestPopup mounted L298-302; SaveSpotSheet L304-311.
- `apps/mobile/components/SaveSpotSheet.tsx` (469 L): `Props = { visible, onClose, coords?:{lat,lon}|null }`; state L48-60 (`name,note,rating,tags:Set,photos,draftUuid,busy`, `sheetRef`); `onSave` L118-141; `effectiveCoords` L46; `TAG_GROUPS` L29-33 (`TREE_TAGS/MUSHROOM_TAGS/BERRY_TAGS` from `@mushroom-map/types`); tag render L253-278; sheet title "Сохранить спот" L158; gorhom open/close imperative via `sheetRef` L66-78.
- `apps/mobile/services/api.ts`: `getApiBaseUrl()` (RN-safe). Mobile does NOT use `@mushroom-map/api-client` (`import.meta.env` breaks Metro).
- Shared types (`packages/types/src/`): `forest.ts` → `ForestInfo { dominant_species, species_composition: Record<string,number>|null, source, confidence, area_m2:number|null, bonitet:number|null, timber_stock:number|null, age_group:string|null }`, `ForestAtResponse { lat, lon, forest: ForestInfo|null, species_theoretical: SpeciesRef[] }`. `species.ts` → `SpeciesRef { slug, name_ru, name_lat?, edibility?, season_months?:number[], affinity?, n_observations? }`, `Edibility = "edible"|"conditionally_edible"|"inedible"|"toxic"|"deadly"`. `soil.ts` → `SoilAtResponse { polygon: SoilPolygon|null, profile_nearest: SoilProfile|null }`, `SoilPolygon { soil0:{descript}, soil1?, soil2?, soil3?, parent1?:{name} }`, `SoilProfile { ph_h2o:number, corg:number, distance_km:number }`. `water.ts` → `WaterDistanceResponse { nearest: WaterCandidate|null, by_source?:{ waterway?, wetland? } }`, `WaterCandidate { kind:WaterKind, name:string|null, distance_m:number }`, `WaterKind = "waterway"|"water_zone"|"wetland"`. `terrain.ts` → `TerrainAtResponse { elevation_m:number|null, slope_deg:number|null, aspect_deg:number|null, aspect_cardinal:string|null }`.
- Web mappings to mirror (`apps/web/src/components/mapView/utils/popup.ts`):
  - FOREST_NAMES slug→noun (L20-36): pine→"Сосновый лес", spruce→"Еловый лес", birch→"Берёзовый лес", aspen→"Осиновый лес", oak→"Дубовый лес", alder→"Ольховый лес", larch→"Лиственничный лес", linden→"Липовый лес", maple→"Кленовый лес", ash→"Ясеневый лес", fir→"Пихтовый лес", cedar→"Кедровый лес" (fallback: "Лес").
  - ROMAN bonitet (L47): `["","I","II","III","IV","V"]`, render only if `1..5` as `бонитет ${ROMAN[b]}`.
  - area: `(area_m2/10000).toFixed(1)+" га"`.
  - EDIBILITY_STYLE (L38-44): edible→`#2e7d32`, conditionally_edible→`#e65100`, inedible→`#757575`, toxic→`#c62828`, deadly→`#b71c1c`, fallback `#333`.
  - MONTH_SHORT (L46): `["","янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"]` (1-indexed); current month = `new Date().getMonth()+1`; bold current if `season_months.includes(cur)`.
  - affinity render: `Math.round(affinity*100)+"%"`.
  - water `fmtDistance` (L66): `<1000 → "${Math.round(m)} м"` else `"${(m/1000).toFixed(1)} км"`; WATER_KIND_LABEL: waterway→"ручей/река", water_zone→"водоохранная зона", wetland→"болото".
  - terrain: only `⛰ Высота: ${Math.round(elevation_m)} м` (slope/aspect intentionally dropped).
  - soil: `polygon.soil0.descript` (main), accompanying `[soil1,soil2,soil3].descript` joined "+ …", `parent1?.name` → "Порода: …"; profile: `ph_h2o.toFixed(1)`, `corg.toFixed(1)+"%"`, `distance_km.toFixed(0)+" км"`.

---

## Task 1: Mobile popup API fetchers (shared types, RN-safe)

**Files:**
- Create: `apps/mobile/services/mapPopupApi.ts`
- Reference: `apps/mobile/services/api.ts` (for `getApiBaseUrl`)

- [ ] **Step 1: Inspect the existing API helper**

Run: open `apps/mobile/services/api.ts`, confirm the exact exported name and signature of the base-url getter (expected `getApiBaseUrl(): string`). If the name differs, use the real name in Step 2.

- [ ] **Step 2: Create the fetchers module**

Create `apps/mobile/services/mapPopupApi.ts`:

```ts
import type {
  ForestAtResponse,
  SoilAtResponse,
  WaterDistanceResponse,
  TerrainAtResponse,
} from "@mushroom-map/types";
import { getApiBaseUrl } from "./api";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function fetchForestAt(lat: number, lon: number) {
  return getJson<ForestAtResponse>(
    `/api/forest/at?lat=${lat}&lon=${lon}`,
  );
}
export function fetchSoilAt(lat: number, lon: number) {
  return getJson<SoilAtResponse>(`/api/soil/at?lat=${lat}&lon=${lon}`);
}
export function fetchWaterDistanceAt(lat: number, lon: number) {
  return getJson<WaterDistanceResponse>(
    `/api/water/distance/at?lat=${lat}&lon=${lon}`,
  );
}
export function fetchTerrainAt(lat: number, lon: number) {
  return getJson<TerrainAtResponse>(
    `/api/terrain/at?lat=${lat}&lon=${lon}`,
  );
}

export type PopupData = {
  forest: ForestAtResponse;
  soil: SoilAtResponse | null;
  water: WaterDistanceResponse | null;
  terrain: TerrainAtResponse | null;
};

/** Mirrors web useMapPopup: forest required, others degrade per-source. */
export async function fetchPopupData(
  lat: number,
  lon: number,
): Promise<PopupData> {
  const [forest, soil, water, terrain] = await Promise.all([
    fetchForestAt(lat, lon),
    fetchSoilAt(lat, lon).catch(() => null),
    fetchWaterDistanceAt(lat, lon).catch(() => null),
    fetchTerrainAt(lat, lon).catch(() => null),
  ]);
  return { forest, soil, water, terrain };
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit`
Expected: PASS (0 errors). If `@mushroom-map/types` subpaths differ, fix imports to the real type names from `packages/types/src/index.ts`.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/services/mapPopupApi.ts
git commit -m "feat(mobile): RN-safe popup API fetchers on shared types"
```

---

## Task 2: Pure presentation helpers (mirror web mappings)

**Files:**
- Create: `apps/mobile/components/MapView/popup/format.ts`

- [ ] **Step 1: Create the helpers**

Create `apps/mobile/components/MapView/popup/format.ts`:

```ts
import type { Edibility } from "@mushroom-map/types";

export const FOREST_NAMES: Record<string, string> = {
  pine: "Сосновый лес", spruce: "Еловый лес", birch: "Берёзовый лес",
  aspen: "Осиновый лес", oak: "Дубовый лес", alder: "Ольховый лес",
  larch: "Лиственничный лес", linden: "Липовый лес", maple: "Кленовый лес",
  ash: "Ясеневый лес", fir: "Пихтовый лес", cedar: "Кедровый лес",
};
export const forestName = (slug?: string | null) =>
  (slug && FOREST_NAMES[slug]) || "Лес";

const ROMAN = ["", "I", "II", "III", "IV", "V"];
export const bonitetLabel = (b?: number | null) =>
  b != null && b >= 1 && b <= 5 ? `бонитет ${ROMAN[b]}` : null;

export const areaHa = (m2?: number | null) =>
  m2 != null ? `${(m2 / 10_000).toFixed(1)} га` : null;

export const EDIBILITY_COLOR: Record<Edibility, string> = {
  edible: "#2e7d32",
  conditionally_edible: "#e65100",
  inedible: "#757575",
  toxic: "#c62828",
  deadly: "#b71c1c",
};
export const edibilityColor = (e?: Edibility | null) =>
  (e && EDIBILITY_COLOR[e]) || "#333333";

export const MONTH_SHORT = [
  "", "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];
export const currentMonth = () => new Date().getMonth() + 1;

export const affinityPct = (a?: number | null) =>
  a != null ? `${Math.round(a * 100)}%` : null;

export const fmtDistance = (m: number) =>
  m < 1000 ? `${Math.round(m)} м` : `${(m / 1000).toFixed(1)} км`;

export const WATER_KIND_LABEL: Record<string, string> = {
  waterway: "ручей/река",
  water_zone: "водоохранная зона",
  wetland: "болото",
};
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/MapView/popup/format.ts
git commit -m "feat(mobile): popup format helpers mirroring web popup.ts"
```

---

## Task 3: Popup sub-block components

**Files:**
- Create: `apps/mobile/components/MapView/popup/ForestBlock.tsx`
- Create: `apps/mobile/components/MapView/popup/SpeciesList.tsx`
- Create: `apps/mobile/components/MapView/popup/SoilBlock.tsx`
- Create: `apps/mobile/components/MapView/popup/WaterBlock.tsx`
- Create: `apps/mobile/components/MapView/popup/TerrainBlock.tsx`
- Reference: existing `ForestPopup.tsx` for token usage / row styles to stay visually consistent.

- [ ] **Step 1: ForestBlock**

Create `ForestBlock.tsx`. Props `{ forest: ForestInfo }`. Render KV rows: `forestName(forest.dominant_species)` as title line, then `age_group` (raw), `bonitetLabel(forest.bonitet)`, `areaHa(forest.area_m2)`, `source` — skip any null. Reuse the row/text styles already in `ForestPopup.tsx` (import tokens `palette/fontSize/spacing` from `@mushroom-map/tokens/native`, mirror the existing `kvBlock` row markup). Keep it presentational (no state, no fetch).

- [ ] **Step 2: SpeciesList**

Create `SpeciesList.tsx`. Props `{ species: SpeciesRef[] }`. For each (slice 0..12): name `s.name_ru` colored `edibilityColor(s.edibility)`; affinity `affinityPct(s.affinity)` if present; season chip row from `s.season_months` using `MONTH_SHORT`, the entry equal to `currentMonth()` rendered bold. No `/species/${slug}` navigation required for v1 (web links; mobile keeps it inert text — note in code comment). Presentational only.

- [ ] **Step 3: SoilBlock**

Create `SoilBlock.tsx`. Props `{ soil: SoilAtResponse }`. If `soil.polygon`: main `polygon.soil0.descript`; accompanying = `[soil1,soil2,soil3]` filtered truthy → `.descript` joined `" + "` prefixed `"+ "`; `polygon.parent1?.name` → `Порода: …`. If `soil.profile_nearest`: `pH ${ph_h2o.toFixed(1)}`, `Cорг ${corg.toFixed(1)}%`, `разрез ${distance_km.toFixed(0)} км`. Render nothing if both null.

- [ ] **Step 4: WaterBlock**

Create `WaterBlock.tsx`. Props `{ water: WaterDistanceResponse }`. If `water.nearest`: `${WATER_KIND_LABEL[kind] ?? kind}${name ? " "+name : ""} — ${fmtDistance(distance_m)}`. Also render `water.by_source?.waterway` / `.wetland` lines when present and different from nearest. Nothing if `nearest` null and no by_source.

- [ ] **Step 5: TerrainBlock**

Create `TerrainBlock.tsx`. Props `{ terrain: TerrainAtResponse }`. Render only `⛰ Высота: ${Math.round(elevation_m)} м` when `elevation_m != null`; otherwise render nothing (slope/aspect intentionally omitted, mirroring web).

- [ ] **Step 6: Typecheck**

Run: `cd apps/mobile && export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/components/MapView/popup/
git commit -m "feat(mobile): presentational popup sub-blocks (forest/species/soil/water/terrain)"
```

---

## Task 4: ForestPopup container — fetch + offline-graceful render

**Files:**
- Modify: `apps/mobile/components/MapView/ForestPopup.tsx`

- [ ] **Step 1: Extend Props and add fetch state**

Add to `Props`: `coords: { lat: number; lon: number } | null` and `onSaveSpot: (args: { lat: number; lon: number; speciesContext: string[] }) => void`. Keep `feature` (tile props) as the instant offline fallback for the forest line + bundled affinity.

Add state: `const [data, setData] = useState<PopupData | null>(null)` and `const [loadState, setLoadState] = useState<"idle"|"loading"|"online"|"offline">("idle")`.

- [ ] **Step 2: Fetch on open**

Add an effect keyed on `[visible, coords?.lat, coords?.lon]`: when `visible && coords`, set `loading`, call `fetchPopupData(coords.lat, coords.lon)` (import from `../../services/mapPopupApi`); on success `setData(...)`, `setLoadState("online")`; on throw (forest failed = offline/no-net) `setData(null)`, `setLoadState("offline")`. Reset to `idle` when `visible` goes false.

- [ ] **Step 3: Render blocks with graceful degradation**

In the ScrollView body:
- Always render the existing forest KV from `feature` (offline-safe) OR, when `data?.forest.forest`, render `<ForestBlock forest={data.forest.forest} />` (richer).
- Species: when `loadState==="online" && data?.forest.species_theoretical?.length` render `<SpeciesList species={data.forest.species_theoretical} />`; else keep the existing bundled "Виды по биотопу" list (offline fallback) unchanged.
- When `loadState==="online"`: render `<SoilBlock>`, `<WaterBlock>`, `<TerrainBlock>` (each self-hides on null).
- When `loadState==="offline"`: render one muted line `Доп. данные (почва/вода/рельеф) — нет сети`.
- When `loadState==="loading"`: render a small "Загрузка…" line under the forest block (do not block the always-visible forest/species core).

- [ ] **Step 4: Add Save CTA (item 2)**

Above the "Закрыть" button add a primary Pressable `Сохранить место` that calls `onSaveSpot({ lat: coords.lat, lon: coords.lon, speciesContext })` then `onClose()`. `speciesContext` = `Object.keys(data?.forest.forest?.species_composition ?? {})`; if empty, fall back to `feature?.dominant_species ? [feature.dominant_species] : []`. Disable the CTA if `coords == null`.

- [ ] **Step 5: Typecheck**

Run: `cd apps/mobile && export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/components/MapView/ForestPopup.tsx
git commit -m "feat(mobile): ForestPopup fetches soil/water/terrain + species, offline-graceful, save CTA"
```

---

## Task 5: SpikeMap — pass tap coords + wire popup save

**Files:**
- Modify: `apps/mobile/components/MapView/SpikeMap.tsx`

- [ ] **Step 1: Capture tap coordinates for the popup**

In `onPress` (≈L240-258), after a hit is found, also capture lon/lat. `queryRenderedFeaturesAtPoint` returns features with geometry; use the hit feature's point geometry if present, else convert the screen point: prefer reading `hit.geometry` coordinates the same way `onLongPress` reads `feature.geometry.coordinates`. Store `const [popupCoords, setPopupCoords] = useState<{lat:number;lon:number}|null>(null)` alongside `popupFeature`; set both together; clear both in `onClose`.

- [ ] **Step 2: Pass new props to ForestPopup**

Update the mount (≈L298-302) to:

```tsx
<ForestPopup
  visible={popupFeature !== null}
  feature={popupFeature}
  coords={popupCoords}
  onClose={() => { setPopupFeature(null); setPopupCoords(null); }}
  onSaveSpot={({ lat, lon, speciesContext }) => {
    setSaveSpotCoords({ lat, lon });
    setSaveSpotSpecies(speciesContext);
    setPopupFeature(null);
    setPopupCoords(null);
    setSaveSpotOpen(true);
  }}
/>
```

Add `const [saveSpotSpecies, setSaveSpotSpecies] = useState<string[]>([])`. In `onLongPress` set `setSaveSpotSpecies([])` (no выдел context).

- [ ] **Step 3: Pass species context to SaveSpotSheet**

Update SaveSpotSheet mount (≈L304-311) to also pass `speciesContext={saveSpotSpecies}` and reset it in `onClose`.

- [ ] **Step 4: Typecheck**

Run: `cd apps/mobile && export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit`
Expected: PASS (SaveSpotSheet prop added in Task 8 — if tsc flags an unknown prop now, proceed; Task 8 adds it. To keep tsc green between tasks, do Step 3 in Task 8 instead. Order: complete Steps 1-2 here, defer Step 3 to Task 8 Step 1.)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/MapView/SpikeMap.tsx
git commit -m "feat(mobile): pass tap coords to popup, wire popup save CTA to SaveSpotSheet"
```

---

## Task 6: SaveSpotSheet — name-required validation

**Files:**
- Modify: `apps/mobile/components/SaveSpotSheet.tsx`

- [ ] **Step 1: Add error state + validate in onSave**

Add `const [nameError, setNameError] = useState(false)`. In `onSave` (≈L118-141), before `setBusy(true)`:

```tsx
if (!name.trim()) {
  setNameError(true);
  return;
}
setNameError(false);
```

In the reset effect (≈L66-78, on `visible` true) add `setNameError(false)`.

- [ ] **Step 2: Surface the error on the name input**

On the name `BottomSheetTextInput`: add `onChangeText` wrapper that also does `if (nameError) setNameError(false)`; apply an error border style when `nameError` (reuse `palette.danger` token if present, else a red from tokens) and render a small helper `Введите название` line under the field when `nameError`.

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/components/SaveSpotSheet.tsx
git commit -m "feat(mobile): SaveSpot name-required validation"
```

---

## Task 7: SaveSpotSheet — done-state

**Files:**
- Modify: `apps/mobile/components/SaveSpotSheet.tsx`

- [ ] **Step 1: Add done state**

Add `const [done, setDone] = useState(false)`. In `onSave`, on successful `await add(...)`, instead of immediately `onClose()`, do `setDone(true)` (keep the sheet open). Reset `setDone(false)` in the visible-true reset effect.

- [ ] **Step 2: Render done view**

When `done`, replace the form body in the `BottomSheetScrollView` with a confirmation block: a check/“Сохранено” heading, the spot name, and two actions — `Готово` (calls `onClose()`) and `Мои места` (calls `onClose()`; deep navigation to the tab is optional for v1, leave a `// TODO nav` comment only — not a placeholder in the plan sense, this is an explicit v1 cut). Keep gorhom close behaviour intact.

- [ ] **Step 3: Typecheck + emulator screenshot**

Run: `cd apps/mobile && export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit` → PASS.
Then on a running ≥4 GB emulator with the app installed: trigger save, `adb exec-out screencap -p > /c/tmp/done.png`, open it, confirm the done-state renders.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/components/SaveSpotSheet.tsx
git commit -m "feat(mobile): SaveSpot done-state confirmation"
```

---

## Task 8: SaveSpotSheet — species-aware tree-tag filter

**Files:**
- Modify: `apps/mobile/components/SaveSpotSheet.tsx`
- Modify: `apps/mobile/components/MapView/SpikeMap.tsx` (deferred Step 3 from Task 5)

- [ ] **Step 1: Wire the deferred SpikeMap prop**

Apply Task 5 Step 3 now: add `speciesContext={saveSpotSpecies}` to the SaveSpotSheet mount and reset in its `onClose`.

- [ ] **Step 2: Accept and apply the filter**

In `SaveSpotSheet` `Props` add `speciesContext?: string[]`. Build the tree group dynamically:

```tsx
const treeTags =
  speciesContext && speciesContext.length > 0
    ? TREE_TAGS.filter((t) => speciesContext.includes(t.slug))
    : TREE_TAGS;
```

If the filtered list is empty (context present but no overlap), fall back to full `TREE_TAGS`. Use `treeTags` in the `TAG_GROUPS` "Деревья" entry instead of the static `TREE_TAGS` (build `TAG_GROUPS` inside the component so it sees `treeTags`). Mushroom/Berry groups unchanged. (Note: `t.slug` vs forest species slug must use the same vocabulary — confirm `TREE_TAGS[].slug` matches forest species slugs like `pine`; if the tag dict uses different keys, map via the existing shared `@mushroom-map/types` spotTags mapping, do not fork.)

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/components/SaveSpotSheet.tsx apps/mobile/components/MapView/SpikeMap.tsx
git commit -m "feat(mobile): filter tree tags by tapped выдел species (fallback to full)"
```

---

## Task 9: Terminology rename + stale copy fix

**Files:**
- Modify: `apps/mobile/app/(tabs)/_layout.tsx` (L21)
- Modify: `apps/mobile/app/(tabs)/spots.tsx` (L172, L258)
- Modify: `apps/mobile/components/SaveSpotSheet.tsx` (L158)

- [ ] **Step 1: Rename strings**

- `_layout.tsx` L21: `options={{ title: "Споты" }}` → `options={{ title: "Мои места" }}`.
- `spots.tsx` L172: heading `Споты` → `Мои места`.
- `spots.tsx` L258: replace `Спотов пока нет. Тапни оранжевую кнопку на карте чтобы сохранить место.` with copy referencing real paths, e.g. `Пока пусто. Нажми на лесной выдел и «Сохранить место», или удерживай палец на карте.` (must match the CTA label used in Task 4 Step 4 — `Сохранить место`).
- `SaveSpotSheet.tsx` L158: title `Сохранить спот` → `Сохранить место`.

- [ ] **Step 2: Grep for leftover user-facing "спот"**

Run: `grep -rne "[Сс]пот" apps/mobile/app apps/mobile/components` and confirm every remaining hit is a code identifier (`saveSpot*`, `spotPhotos`, store names) NOT a displayed string. Fix any displayed straggler to «…место».

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/(tabs)/_layout.tsx apps/mobile/app/(tabs)/spots.tsx apps/mobile/components/SaveSpotSheet.tsx
git commit -m "chore(mobile): Споты→Мои места, fix stale save-hint copy"
```

---

## Task 10: Full emulator smoke + final verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck whole app**

Run: `cd apps/mobile && export PATH="/c/Program Files/nodejs:$PATH" && npx tsc --noEmit`
Expected: PASS, 0 errors.

- [ ] **Step 2: Rebuild + install on a ≥4 GB emulator**

Confirm AVD `hw.ramSize >= 4096M` (see `memory/feedback_mobile_emulator_ram_floor.md`). Build x86_64-only debug APK and install (`apps/mobile/android/app/build.gradle` already has `ndk { abiFilters 'x86_64' }` from prior session — keep). Start Metro, `adb reverse tcp:8081 tcp:8081`, launch `ru.geobiom.mobile/.MainActivity`.

- [ ] **Step 3: Screenshot each acceptance criterion**

Use `adb exec-out screencap -p > /c/tmp/<name>.png` and visually confirm each:
- Tap a forest выдел online → popup shows forest + species (with edibility colours + season) + soil + water + terrain blocks.
- Toggle airplane mode, tap a выдел → popup still shows forest + bundled "Виды по биотопу", soil/water/terrain replaced by "нет сети" line (no crash, core not blocked).
- Popup `Сохранить место` opens SaveSpotSheet with coordinates seeded.
- SaveSpot: empty name blocks save + shows error; valid name → done-state appears.
- SaveSpot opened from a выдел shows only that выдел's tree tags; from long-press shows all tree tags.
- Tab bar + screen heading read «Мои места»; SaveSpot title «Сохранить место»; empty-state copy references real save paths.

- [ ] **Step 4: Final commit (if any verification tweaks)**

```bash
git add -A apps/mobile
git commit -m "test(mobile): emulator smoke pass for design-adaptation"
```

---

## Self-review (completed by plan author)

- **Spec coverage:** Item1→Tasks 1-4; Item2 (save CTA)→Task 4 Step 4 + Task 5; Item3 (validation+done)→Tasks 6-7; Item4 (tree-tag filter)→Task 8; Item5 (rename+stale copy)→Task 9; offline-graceful→Task 4 Step 3 + Task 10 Step 3; cuts (inline-tour/sidebar/species re-skin) → not present, correctly absent. All spec sections mapped.
- **Placeholder scan:** No "TBD/handle errors/etc." Code shown for every code step. The two `// TODO` mentions (species link, Мои места nav) are explicitly declared v1 cuts, not hidden work.
- **Type consistency:** `PopupData`, `fetchPopupData`, `ForestFeatureProps`, `coords`, `onSaveSpot({lat,lon,speciesContext})`, `speciesContext?: string[]`, `nameError`, `done` are used with identical names/shapes across Tasks 1,4,5,6,7,8. Cross-task ordering hazard (SaveSpotSheet new prop) explicitly sequenced: Task 5 Step 3 deferred into Task 8 Step 1 so `tsc` stays green between tasks.
- **Known assumption flagged in-task:** Task 8 Step 2 calls out the `TREE_TAGS[].slug` vs forest-species-slug vocabulary match as a thing to verify against shared types rather than assume.
