# MapView Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сократить `apps/web/src/components/MapView.tsx` с 837 строк до ≤ 80, перевести все 12 toggle-слоёв на декларативный реестр + единственный источник правды (`useLayerVisibility` store), удалить `MapControls`, унифицировать UI на расширенном `LayerGrid`.

**Architecture:** Реестр (`registry.ts`) описывает все 12 слоёв декларативно (id, pmtiles file, addFn, setVisibility, sources, layers). Один `useMapLayers(map)` хук — единственный controller, который дёргает MapLibre `addLayer/removeLayer/setVisibility`, реагируя на `useLayerVisibility` store. Прочая логика расцеплена в адресные хуки (`useBaseMap`, `useMapPopup`, `useMapUrl`, `useMapShare`, `useMapSpeciesFilter`). UI разделён на самоподписывающиеся компоненты (`LayerGrid`, `BaseMapPicker`, `ShareButton`, `MapOverlays`, `CursorReadout`, `SpeciesFilterBadge`).

**Tech Stack:** React 18, TypeScript 5.5, MapLibre GL 4.5, Zustand 5, PMTiles 3.2, Vite 5, Playwright 1.59.

**Сквозные требования (применяются к каждой задаче):**
- Перед коммитом: `npx tsc --noEmit` (из `apps/web`) проходит без ошибок.
- Перед коммитом каждой фазы: `npx playwright test` проходит на host dev-server'е.
- Прод-тач: после каждой фазы — visual smoke-чек на dev-сервере (`npm run dev` из репо-root). Чек-лист в каждой фазе.
- Стиль коммита: `refactor(web/mapview): <фаза N.M> — <что сделано>`.
- Не объединять фазы в один коммит. Каждая фаза = отдельный revertable commit.

**Спека:** [docs/superpowers/specs/2026-04-29-mapview-decomposition-design.md](../specs/2026-04-29-mapview-decomposition-design.md).

---

## Фаза 1: Расширение store

**Цель:** `useLayerVisibility` получает поля для всего, что сейчас держится в локальных useState. MapView пока ничего не меняет — изменения dormant.

### Task 1.1: Добавить errorMsg + ui-flags в store

**Files:**
- Modify: `apps/web/src/store/useLayerVisibility.ts`

- [ ] **Step 1: Расширить интерфейс state**

В `apps/web/src/store/useLayerVisibility.ts` после `forestColorMode: ForestColorMode;` добавить блок:

```ts
  /** Текст ошибки, отображаемый красным toast'ом ~5 сек. null = тоста нет. */
  errorMsg: string | null;
  /** Тост «спутник может не загружаться при VPN». 'visible' → 'fading' (800ms) → 'hidden'. */
  vpnToast: "hidden" | "visible" | "fading";
  /** Тост-подсказка после первого включения forest. Тот же lifecycle. */
  forestHint: "hidden" | "visible" | "fading";
  /** Тост «ссылка скопирована». Boolean — короткий 2-сек pulse. */
  shareToast: boolean;
  /** Бейдж активного species-фильтра. null = бейджа нет. */
  speciesFilterLabel: string | null;
```

И добавить actions после `selectForestMode`:

```ts
  setErrorMsg: (msg: string | null) => void;
  setVpnToast: (state: "hidden" | "visible" | "fading") => void;
  setForestHint: (state: "hidden" | "visible" | "fading") => void;
  setShareToast: (value: boolean) => void;
  setSpeciesFilterLabel: (label: string | null) => void;
```

- [ ] **Step 2: Реализация действий**

В `create<LayerVisibilityState>(...)` body добавить рядом с существующими actions:

```ts
  errorMsg: null,
  vpnToast: "hidden",
  forestHint: "hidden",
  shareToast: false,
  speciesFilterLabel: null,

  setErrorMsg: (msg) => set({ errorMsg: msg }),
  setVpnToast: (state) => set({ vpnToast: state }),
  setForestHint: (state) => set({ forestHint: state }),
  setShareToast: (value) => set({ shareToast: value }),
  setSpeciesFilterLabel: (label) => set({ speciesFilterLabel: label }),
```

- [ ] **Step 3: Typecheck**

Из `apps/web`:
```bash
export PATH="/c/Program Files/nodejs:$PATH"
npx tsc --noEmit
```
Expected: 0 errors. Если ругается на `errorMsg` — проверить что добавил поле и в `LayerVisibilityState` interface, и в state body.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/store/useLayerVisibility.ts
git commit -m "refactor(web/mapview): фаза 1.1 — расширение store схемы (errorMsg, ui-флаги)"
```

---

### Task 1.2: Добавить speciesFilter (типы + actions) в store

**Files:**
- Modify: `apps/web/src/store/useLayerVisibility.ts`

- [ ] **Step 1: Добавить интерфейс speciesFilter**

В `LayerVisibilityState` после `speciesFilterLabel`:

```ts
  /** Активный species-фильтр для forest-fill: список slug'ов или null = без фильтра. */
  speciesFilter: string[] | null;
  setSpeciesFilter: (slugs: string[] | null, label: string | null) => void;
```

В body store после `setSpeciesFilterLabel`:

```ts
  speciesFilter: null,
  setSpeciesFilter: (slugs, label) =>
    set({
      speciesFilter: slugs && slugs.length > 0 ? slugs : null,
      speciesFilterLabel: label,
    }),
```

- [ ] **Step 2: Typecheck**

Из `apps/web`:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/store/useLayerVisibility.ts
git commit -m "refactor(web/mapview): фаза 1.2 — speciesFilter в store"
```

---

### Task 1.3: Добавить baseMap в store

**Files:**
- Modify: `apps/web/src/store/useLayerVisibility.ts`

**Контекст:** `baseMap` сейчас локальный useState в MapView. После рефакторинга — store, чтобы `BaseMapPicker` рендерился вне MapView и мог переключать.

- [ ] **Step 1: Добавить тип BaseMapMode и поле в state**

В `apps/web/src/store/useLayerVisibility.ts` после `export type ForestColorMode = ...`:

```ts
export type BaseMapMode = "osm" | "scheme" | "satellite" | "hybrid";
```

В `LayerVisibilityState` interface после `forestColorMode`:

```ts
  baseMap: BaseMapMode;
  setBaseMap: (mode: BaseMapMode) => void;
```

В store body — где-то рядом с `forestColorMode: "species"`:

```ts
  baseMap: "scheme",
  setBaseMap: (mode) => set({ baseMap: mode }),
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: Commit фазы целиком**

```bash
git add apps/web/src/store/useLayerVisibility.ts
git commit -m "refactor(web/mapview): фаза 1.3 — baseMap в store"
```

- [ ] **Step 4: Прод-проверка фазы 1**

Из репо-root:
```bash
export PATH="/c/Program Files/nodejs:$PATH"
npm run dev
```

Открыть `http://localhost:5173` в браузере. **Ожидаемое поведение — никакого визуального изменения**, потому что MapView пока не подписан на новые поля. Только:
- [ ] страница `/` рендерится без ошибок в консоли
- [ ] чипы LayerGrid в SidebarDistrict (`/map/:district`) работают (они уже подписаны на store)

Если что-то сломалось — это значит, что-то из existing кода case-sensitively упало в новые поля. Откатить commit и расследовать.

---

## Фаза 2: Layer registry + useMapLayers hook

**Цель:** Все 12 toggle-handler'ов в MapView заменяются одним `useMapLayers` хуком, который читает декларативный реестр и применяет изменения через MapLibre.

### Task 2.1: Создать LAYER_REGISTRY

**Files:**
- Create: `apps/web/src/components/mapView/registry.ts`

- [ ] **Step 1: Написать реестр**

Создать файл `apps/web/src/components/mapView/registry.ts`:

```ts
/**
 * LAYER_REGISTRY — декларативное описание всех слоёв карты (кроме userSpots,
 * который data-driven — управляется отдельным `useUserSpotsSync` хуком).
 *
 * Контракт каждой записи:
 *   - `id`: ключ из useLayerVisibility.LayerKey
 *   - `pmtiles`: имя файла в TILES_BASE; null = слой через GeoJSON API (districts)
 *   - `missingMsg`: показывается через store.setErrorMsg, если HEAD на pmtiles упал
 *   - `add(map)`: добавить source + layer в инстанс карты
 *   - `setVisibility(map, visible)`: переключить layout.visibility
 *   - `sources`, `layers`: ID's, которые `add` создаёт. Используются `useMapLayers`
 *      для cleanup'а при basemap-switch'е (setStyle убивает layers, иногда оставляя
 *      sources в зомби-состоянии).
 */
import type { Map } from "maplibre-gl";
import type { LayerKey } from "../../store/useLayerVisibility";

import { addForestLayer, setForestVisibility } from "./layers/forest";
import { addWaterLayer, setWaterVisibility } from "./layers/water";
import { addWaterwayLayer, setWaterwayVisibility } from "./layers/waterway";
import { addWetlandLayer, setWetlandVisibility } from "./layers/wetland";
import { addOoptLayer, setOoptVisibility } from "./layers/oopt";
import { addRoadsLayer, setRoadsVisibility } from "./layers/roads";
import { addFellingLayer, setFellingVisibility } from "./layers/felling";
import { addProtectiveLayer, setProtectiveVisibility } from "./layers/protective";
import { addSoilLayer, setSoilVisibility } from "./layers/soil";
import { addHillshadeLayer, setHillshadeVisibility } from "./layers/hillshade";
import { addDistrictsLayer, setDistrictsVisibility } from "./layers/districts";
import {
  addForecastChoroplethLayer,
  setForecastChoroplethVisibility,
} from "./layers/forecastChoropleth";

export type RegistryLayerKey = Exclude<LayerKey, "userSpots">;

export interface LayerEntry {
  id: RegistryLayerKey;
  pmtiles: string | null;
  missingMsg: string | null;
  add: (map: Map) => void;
  setVisibility: (map: Map, visible: boolean) => void;
  sources: string[];
  layers: string[];
}

export const LAYER_REGISTRY: LayerEntry[] = [
  {
    id: "forest",
    pmtiles: "forest.pmtiles",
    missingMsg: "Леса не собраны — запустите ingest_forest.py + build_tiles.py",
    add: addForestLayer,
    setVisibility: setForestVisibility,
    sources: ["forest"],
    layers: ["forest-fill"],
  },
  {
    id: "water",
    pmtiles: "water.pmtiles",
    missingMsg: "Водоохранные зоны не собраны — запустите ingest_water.py и build_water_tiles.py",
    add: addWaterLayer,
    setVisibility: setWaterVisibility,
    sources: ["water"],
    layers: ["water-fill"],
  },
  {
    id: "waterway",
    pmtiles: "waterway.pmtiles",
    missingMsg: "Данные водотоков не загружены — запустите ingest_waterway.py и build_waterway_tiles.py",
    add: addWaterwayLayer,
    setVisibility: setWaterwayVisibility,
    sources: ["waterway"],
    layers: ["waterway-line"],
  },
  {
    id: "wetland",
    pmtiles: "wetlands.pmtiles",
    missingMsg: "Данные болот не загружены — запустите ingest_wetlands.py и build_wetlands_tiles.py",
    add: addWetlandLayer,
    setVisibility: setWetlandVisibility,
    sources: ["wetland"],
    layers: ["wetland-fill"],
  },
  {
    id: "oopt",
    pmtiles: "oopt.pmtiles",
    missingMsg: "Данные ООПТ не загружены — запустите ingest_oopt.py и build_oopt_tiles.py",
    add: addOoptLayer,
    setVisibility: setOoptVisibility,
    sources: ["oopt"],
    layers: ["oopt-fill"],
  },
  {
    id: "roads",
    pmtiles: "roads.pmtiles",
    missingMsg: "Данные дорог не загружены — запустите ingest_osm_roads.py и build_roads_tiles.py",
    add: addRoadsLayer,
    setVisibility: setRoadsVisibility,
    sources: ["roads"],
    layers: ["roads-line", "roads-casing"],
  },
  {
    id: "felling",
    pmtiles: "felling.pmtiles",
    missingMsg: "Данные вырубок не загружены — запустите ingest_felling.py и build_felling_tiles.py",
    add: addFellingLayer,
    setVisibility: setFellingVisibility,
    sources: ["felling"],
    layers: ["felling-fill"],
  },
  {
    id: "protective",
    pmtiles: "protective.pmtiles",
    missingMsg: "Данные защитных лесов не загружены — запустите ingest_protective.py и build_protective_tiles.py",
    add: addProtectiveLayer,
    setVisibility: setProtectiveVisibility,
    sources: ["protective"],
    layers: ["protective-fill"],
  },
  {
    id: "soil",
    pmtiles: "soil.pmtiles",
    missingMsg: "Данные почв не загружены — запустите ingest_soil.py и build_soil_tiles.py",
    add: addSoilLayer,
    setVisibility: setSoilVisibility,
    sources: ["soil"],
    layers: ["soil-fill"],
  },
  {
    id: "hillshade",
    pmtiles: "hillshade.pmtiles",
    missingMsg: "Hillshade не собран — запустите scripts/download_copernicus_dem.py, build_terrain.py и build_hillshade_tiles.py",
    add: addHillshadeLayer,
    setVisibility: setHillshadeVisibility,
    sources: ["hillshade"],
    layers: ["hillshade-raster"],
  },
  {
    id: "districts",
    pmtiles: null, // GeoJSON через /api/districts
    missingMsg: null,
    add: addDistrictsLayer,
    setVisibility: setDistrictsVisibility,
    sources: ["districts"],
    layers: ["districts-line"],
  },
  {
    id: "forecastChoropleth",
    pmtiles: null, // seeded fixture, без pmtiles
    missingMsg: null,
    add: addForecastChoroplethLayer,
    setVisibility: setForecastChoroplethVisibility,
    sources: ["forecast-choropleth"],
    layers: ["forecast-choropleth-fill"],
  },
];

/** Найти запись по id; throws при опечатке. */
export function getLayerEntry(id: RegistryLayerKey): LayerEntry {
  const entry = LAYER_REGISTRY.find((e) => e.id === id);
  if (!entry) throw new Error(`LAYER_REGISTRY: no entry for "${id}"`);
  return entry;
}
```

**Important:** Имена `sources[]` и `layers[]` должны точно соответствовать тем, что прописаны в каждом `addXxxLayer` модуле. Если есть расхождение — будет zombie source при basemap-switch.

- [ ] **Step 2: Verify source/layer ID's**

Прочитать каждый layer-модуль и убедиться, что `sources`/`layers` arrays соответствуют:

```bash
grep -n "addSource\|addLayer" apps/web/src/components/mapView/layers/*.ts
```

Сверить с реестром выше. Если в каком-то модуле создаётся 2 layer'а — оба должны быть в `layers`. Если расходится — поправить реестр (не модули — модули проверены и работают).

- [ ] **Step 3: Typecheck**

Из `apps/web`:
```bash
npx tsc --noEmit
```
Expected: 0 errors. Если ругается на отсутствующий `addForecastChoroplethLayer` — открыть `apps/web/src/components/mapView/layers/forecastChoropleth.ts` и проверить export'ы; добавить недостающие export'ы там.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/mapView/registry.ts
git commit -m "refactor(web/mapview): фаза 2.1 — LAYER_REGISTRY"
```

---

### Task 2.2: Создать useMapLayers hook

**Files:**
- Create: `apps/web/src/components/mapView/hooks/useMapLayers.ts`

- [ ] **Step 1: Создать директорию hooks**

```bash
mkdir -p apps/web/src/components/mapView/hooks
```

- [ ] **Step 2: Написать хук**

Создать `apps/web/src/components/mapView/hooks/useMapLayers.ts`:

```ts
/**
 * useMapLayers — единственный controller между useLayerVisibility и MapLibre.
 *
 * Отвечает за:
 *  - Lazy-add: при visible=true && !loaded — HEAD-проверка pmtiles, при ok →
 *    add layer + mark loaded + show; при fail → setErrorMsg + откат visible.
 *  - Toggle: при изменении visible на loaded слое — set layout.visibility.
 *  - forestColorMode: setPaintProperty при смене.
 *  - speciesFilter: setFilter при смене.
 *  - Re-apply при basemap-switch'е (вызывается извне через возвращаемый
 *    `reapplyAll` callback).
 *
 * Layer-модули (forest.ts, etc.) сами решают `findFirstSymbolLayerId` для
 * правильного z-order. Re-apply удаляет sources+layers целиком и `entry.add()`'ит
 * заново — тот же путь, что и при первом lazy-add'е. Никаких diff'ов.
 */
import { useEffect, useCallback, useRef } from "react";
import type { Map } from "maplibre-gl";

import { useLayerVisibility } from "../../../store/useLayerVisibility";
import { TILES_BASE } from "../utils/api";
import { LAYER_REGISTRY, type LayerEntry } from "../registry";
import {
  FOREST_LAYER_PAINT_COLOR,
  FOREST_LAYER_PAINT_BONITET,
  FOREST_LAYER_PAINT_AGE_GROUP,
  type ForestColorMode,
} from "../../../lib/forestStyle";

function paintForMode(mode: ForestColorMode) {
  return mode === "bonitet"
    ? FOREST_LAYER_PAINT_BONITET["fill-color"]
    : mode === "age_group"
    ? FOREST_LAYER_PAINT_AGE_GROUP["fill-color"]
    : FOREST_LAYER_PAINT_COLOR["fill-color"];
}

/**
 * Возвращает callback `reapplyAll` — `useBaseMap` вызывает его после успешного
 * `setStyle` + `isStyleLoaded`, чтобы перевыложить все loaded-слои поверх нового
 * базиса.
 */
export function useMapLayers(mapRef: React.MutableRefObject<Map | null>) {
  const visible = useLayerVisibility((s) => s.visible);
  const loaded = useLayerVisibility((s) => s.loaded);
  const forestColorMode = useLayerVisibility((s) => s.forestColorMode);
  const speciesFilter = useLayerVisibility((s) => s.speciesFilter);
  const setLoaded = useLayerVisibility((s) => s.setLoaded);
  const setVisible = useLayerVisibility((s) => s.setVisible);
  const setErrorMsg = useLayerVisibility((s) => s.setErrorMsg);

  // Идёт ли HEAD-check для слоя — чтобы избежать дублирующих запросов
  // при быстрых toggle'ах в DevTools.
  const inFlightRef = useRef<Set<string>>(new Set());

  // Sync эффект — реагирует на changes в visible[]/loaded[].
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    LAYER_REGISTRY.forEach((entry) => {
      const wantVisible = visible[entry.id];
      const isLoaded = loaded[entry.id];

      if (wantVisible && !isLoaded && !inFlightRef.current.has(entry.id)) {
        // Lazy-add path
        void lazyAdd(m, entry);
      } else if (isLoaded) {
        // Toggle visibility on already-loaded layer
        applyVisibility(m, entry, wantVisible);
      }
    });

    async function lazyAdd(m: Map, entry: LayerEntry) {
      inFlightRef.current.add(entry.id);
      try {
        if (entry.pmtiles) {
          const resp = await fetch(`${TILES_BASE}/${entry.pmtiles}`, { method: "HEAD" });
          if (!resp.ok) {
            setErrorMsg(entry.missingMsg ?? `Слой "${entry.id}" недоступен`);
            setTimeout(() => setErrorMsg(null), 5000);
            setVisible(entry.id, false);
            return;
          }
        }
        const doAdd = () => {
          entry.add(m);
          setLoaded(entry.id, true);
          entry.setVisibility(m, true);
        };
        if (m.isStyleLoaded()) doAdd();
        else m.once("idle", doAdd);
      } catch {
        setErrorMsg(`Не удалось проверить ${entry.pmtiles ?? entry.id}`);
        setTimeout(() => setErrorMsg(null), 4000);
        setVisible(entry.id, false);
      } finally {
        inFlightRef.current.delete(entry.id);
      }
    }

    function applyVisibility(m: Map, entry: LayerEntry, value: boolean) {
      // Может быть race: loaded=true в store, но style ещё не догнал.
      if (entry.layers.every((l) => m.getLayer(l))) {
        entry.setVisibility(m, value);
      } else {
        m.once("idle", () => {
          if (entry.layers.every((l) => m.getLayer(l))) {
            entry.setVisibility(m, value);
          }
        });
      }
    }
  }, [visible, loaded, mapRef, setLoaded, setVisible, setErrorMsg]);

  // forestColorMode: setPaintProperty
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !m.getLayer("forest-fill")) return;
    m.setPaintProperty("forest-fill", "fill-color", paintForMode(forestColorMode));
  }, [forestColorMode, mapRef]);

  // speciesFilter: setFilter
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !m.getLayer("forest-fill")) return;
    if (!speciesFilter) {
      m.setFilter("forest-fill", null);
    } else {
      m.setFilter("forest-fill", [
        "in",
        ["get", "dominant_species"],
        ["literal", speciesFilter],
      ]);
    }
  }, [speciesFilter, mapRef]);

  // reapplyAll — вызывается из useBaseMap после setStyle.
  const reapplyAll = useCallback(() => {
    const m = mapRef.current;
    if (!m) return;

    LAYER_REGISTRY.forEach((entry) => {
      // Снести всё, что от нас может остаться (setStyle с diff:false уже сжёг
      // layers, но source иногда выживает в зомби-состоянии).
      entry.layers.forEach((l) => {
        if (m.getLayer(l)) m.removeLayer(l);
      });
      entry.sources.forEach((s) => {
        if (m.getSource(s)) m.removeSource(s);
      });
      // Пере-добавить, если в сторе помечен loaded.
      if (loaded[entry.id]) {
        entry.add(m);
        entry.setVisibility(m, visible[entry.id]);
      }
    });

    // forestColorMode и speciesFilter переприменяем — добавление layer'а сбросило
    // paint/filter обратно к defaults модуля.
    if (m.getLayer("forest-fill")) {
      m.setPaintProperty("forest-fill", "fill-color", paintForMode(forestColorMode));
      if (speciesFilter) {
        m.setFilter("forest-fill", [
          "in",
          ["get", "dominant_species"],
          ["literal", speciesFilter],
        ]);
      }
    }
  }, [mapRef, loaded, visible, forestColorMode, speciesFilter]);

  return { reapplyAll };
}
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/mapView/hooks/useMapLayers.ts
git commit -m "refactor(web/mapview): фаза 2.2 — useMapLayers hook"
```

---

### Task 2.3: Интегрировать useMapLayers в MapView, удалить 12 handler'ов

**Files:**
- Modify: `apps/web/src/components/MapView.tsx`

**Контекст:** Это самая рискованная задача всей миграции. После неё MapView должен работать визуально идентично текущему. MapControls остаётся — мы переписываем его callback'и, чтобы они дёргали store, а не локальные setters.

- [ ] **Step 1: Удалить 24 useState + 24 useRef**

Открыть `apps/web/src/components/MapView.tsx`. Удалить строки **58–122** (12 пар `useState` + 12 пар `useRef`). Оставить только:

```tsx
  const mobile = useIsMobile();
  const mapRef = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const [cursor, setCursor] = useState<{ lat: number; lon: number } | null>(null);
  const userSpotsRef = useRef<UserSpot[] | null>(userSpots);
  userSpotsRef.current = userSpots;
  const appliedBaseMap = useRef<BaseMapMode>("osm");
```

`forestColorMode`, `errorMsg`, `vpnToast`, `forestHint`, `shareToast`, `speciesFilterLabel`, `baseMap` — теперь из store. `cursor` остаётся локальным до фазы 5 (CursorReadout вынесет его).

- [ ] **Step 2: Удалить setupForestAndInteractions целиком**

Удалить функцию `setupForestAndInteractions` (строки ~136–219 в оригинале). Её роль теперь у `reapplyAll` из `useMapLayers`. UserSpots останется отдельным хуком (см. Step 4).

- [ ] **Step 3: Удалить все handleXxxToggle и toggleLayerWithCheck**

Удалить функции:
- `handleForestToggle` (~223–246)
- `handleWaterToggle` (~248–262)
- `toggleLayerWithCheck` (~265–303)
- `handleOoptToggle`, `handleRoadsToggle`, `handleWetlandToggle`, `handleFellingToggle`, `handleProtectiveToggle`, `handleSoilToggle`, `handleWaterwayToggle`, `handleHillshadeToggle`, `handleDistrictsToggle` (~305–410)
- `handleForestColorMode` (~412–421)
- `handleSpeciesFilter` (~464–473)
- 4 sync useEffect'а (`storeForestVisible`, `storeForestColorMode`, `storeSoilVisible`, `storeHillshadeVisible`) (~639–675)

Импорты, которые становятся неиспользуемыми, тоже удалить — TypeScript подскажет.

- [ ] **Step 4: Заменить логику на хук + добавить переходный proxy для MapControls**

В начале body компонента (после useState/useRef'ов из Step 1) добавить:

```tsx
  const baseMap = useLayerVisibility((s) => s.baseMap);
  const setBaseMap = useLayerVisibility((s) => s.setBaseMap);
  const visible = useLayerVisibility((s) => s.visible);
  const loaded = useLayerVisibility((s) => s.loaded);
  const toggleVisible = useLayerVisibility((s) => s.toggleVisible);
  const setStoreVisible = useLayerVisibility((s) => s.setVisible);
  const forestColorMode = useLayerVisibility((s) => s.forestColorMode);
  const setForestColorMode = useLayerVisibility((s) => s.setForestColorMode);
  const setShareToast = useLayerVisibility((s) => s.setShareToast);
  const setForestHint = useLayerVisibility((s) => s.setForestHint);
  const setSpeciesFilter = useLayerVisibility((s) => s.setSpeciesFilter);

  const { reapplyAll } = useMapLayers(map);
```

И импорты сверху:

```tsx
import { useLayerVisibility, type BaseMapMode } from "../store/useLayerVisibility";
import { useMapLayers } from "./mapView/hooks/useMapLayers";
```

Удалить `import { ..., BaseMapMode } from "./MapControls"` (тип теперь из store) — но сам `import { MapControls }` оставить.

- [ ] **Step 5: Заменить setStyle effect на reapplyAll**

В `useEffect` для basemap-switch'а (~569–604) заменить тело на:

```tsx
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (appliedBaseMap.current === baseMap) return;

    let cancelled = false;

    const apply = (style: maplibregl.StyleSpecification) => {
      if (cancelled) return;
      m.setStyle(style, { diff: false });
      appliedBaseMap.current = baseMap;

      const poll = () => {
        if (cancelled) return;
        if (m.isStyleLoaded()) {
          // places labels — отдельно, они не в registry
          if (m.getLayer("places-text")) m.removeLayer("places-text");
          if (m.getSource("places")) m.removeSource("places");
          if (baseMap === "scheme" || baseMap === "hybrid") {
            addPlaceLabelsLayer(m);
          }
          // userSpots — отдельно
          const spots = userSpotsRef.current;
          if (m.getLayer("user-spots")) m.removeLayer("user-spots");
          if (m.getSource("user-spots-src")) m.removeSource("user-spots-src");
          if (spots && spots.length > 0) addUserSpotsLayer(m, spots);
          // Все registry-слои
          reapplyAll();
        } else {
          requestAnimationFrame(poll);
        }
      };
      requestAnimationFrame(poll);
    };

    if (baseMap === "scheme") {
      buildSchemeStyle().then(apply).catch(() => apply(SCHEME_STYLE_FALLBACK));
    } else if (baseMap === "hybrid") {
      buildHybridStyle().then(apply).catch(() => apply(HYBRID_STYLE_FALLBACK));
    } else {
      apply(baseMap === "satellite" ? SATELLITE_STYLE : INLINE_STYLE);
    }

    return () => { cancelled = true; };
  }, [baseMap, reapplyAll]);
```

В первоначальном map-init `useEffect` (~475+) внутри `onStyleReady` callback'а заменить `setupForestAndInteractions(m);` на:

```tsx
        // places labels
        if (m.getLayer("places-text")) m.removeLayer("places-text");
        if (m.getSource("places")) m.removeSource("places");
        addPlaceLabelsLayer(m);
        // userSpots если есть
        const spots = userSpotsRef.current;
        if (spots && spots.length > 0) addUserSpotsLayer(m, spots);
        // registry слои уже подхватятся через useMapLayers (он реагирует
        // на default visible[] = forest:true, hillshade:true и т.п.)
```

- [ ] **Step 6: Заменить handleShare**

Найти `handleShare` (~445) и заменить:

```tsx
  const handleShare = useCallback(() => {
    const m = map.current;
    if (!m) return;
    const { lat, lng } = m.getCenter();
    const z = Math.round(m.getZoom() * 10) / 10;
    const url = new URL(window.location.href);
    url.searchParams.set("lat", lat.toFixed(5));
    url.searchParams.set("lon", lng.toFixed(5));
    url.searchParams.set("z", String(z));
    navigator.clipboard.writeText(url.toString()).then(() => {
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2000);
    });
  }, [setShareToast]);
```

`setShareToast` теперь из store (был добавлен в фазе 1).

- [ ] **Step 7: Адаптировать handleSpeciesFilter**

```tsx
  const handleSpeciesFilter = useCallback((forestTypes: string[] | null, label: string | null) => {
    setSpeciesFilter(forestTypes, label);
  }, [setSpeciesFilter]);
```

- [ ] **Step 8: MapControls callbacks — переходные thunks**

`MapControls` всё ещё рендерится со старым props-API. Каждый его `onXxxToggle` теперь дёргает store. Заменить JSX:

```tsx
      <MapControls
        baseMap={baseMap}
        onBaseMapChange={setBaseMap}
        forestVisible={visible.forest}
        forestLoaded={loaded.forest}
        onForestToggle={() => {
          toggleVisible("forest");
          if (!loaded.forest) {
            setForestHint("visible");
            setTimeout(() => setForestHint("fading"), 4000);
          }
        }}
        forestColorMode={forestColorMode}
        onForestColorMode={setForestColorMode}
        waterVisible={visible.water}
        waterLoaded={loaded.water}
        onWaterToggle={() => toggleVisible("water")}
        ooptVisible={visible.oopt}
        ooptLoaded={loaded.oopt}
        onOoptToggle={() => toggleVisible("oopt")}
        roadsVisible={visible.roads}
        roadsLoaded={loaded.roads}
        onRoadsToggle={() => toggleVisible("roads")}
        wetlandVisible={visible.wetland}
        wetlandLoaded={loaded.wetland}
        onWetlandToggle={() => toggleVisible("wetland")}
        fellingVisible={visible.felling}
        fellingLoaded={loaded.felling}
        onFellingToggle={() => toggleVisible("felling")}
        protectiveVisible={visible.protective}
        protectiveLoaded={loaded.protective}
        onProtectiveToggle={() => toggleVisible("protective")}
        soilVisible={visible.soil}
        soilLoaded={loaded.soil}
        onSoilToggle={() => toggleVisible("soil")}
        waterwayVisible={visible.waterway}
        waterwayLoaded={loaded.waterway}
        onWaterwayToggle={() => toggleVisible("waterway")}
        hillshadeVisible={visible.hillshade}
        hillshadeLoaded={loaded.hillshade}
        onHillshadeToggle={() => toggleVisible("hillshade")}
        districtsVisible={visible.districts}
        districtsLoaded={loaded.districts}
        onDistrictsToggle={() => toggleVisible("districts")}
        onShare={handleShare}
      />
```

- [ ] **Step 9: Adjust toasts JSX**

В нижнем JSX (`{shareToast && ...}`, `{errorMsg && ...}`, `{vpnToast !== "hidden" && ...}`, `{forestHint !== "hidden" && ...}`, `{speciesFilterLabel && ...}`) — все эти переменные теперь читаются из store. В начале body добавить:

```tsx
  const errorMsg = useLayerVisibility((s) => s.errorMsg);
  const vpnToast = useLayerVisibility((s) => s.vpnToast);
  const forestHint = useLayerVisibility((s) => s.forestHint);
  const shareToast = useLayerVisibility((s) => s.shareToast);
  const speciesFilterLabel = useLayerVisibility((s) => s.speciesFilterLabel);
  const setVpnToast = useLayerVisibility((s) => s.setVpnToast);
```

Адаптировать vpnToast effect (строка 423):

```tsx
  useEffect(() => {
    if (baseMap === "satellite" || baseMap === "hybrid") {
      setVpnToast("visible");
      const t = setTimeout(() => setVpnToast("fading"), 3500);
      return () => clearTimeout(t);
    }
  }, [baseMap, setVpnToast]);

  useEffect(() => {
    if (vpnToast === "fading") {
      const t = setTimeout(() => setVpnToast("hidden"), 800);
      return () => clearTimeout(t);
    }
  }, [vpnToast, setVpnToast]);
```

То же для forestHint (строка 438):

```tsx
  const setForestHint = useLayerVisibility((s) => s.setForestHint);
  useEffect(() => {
    if (forestHint === "fading") {
      const t = setTimeout(() => setForestHint("hidden"), 800);
      return () => clearTimeout(t);
    }
  }, [forestHint, setForestHint]);
```

- [ ] **Step 10: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 0 errors. Если падает — обычно из-за неудалённого imports или забытых ссылок на удалённые ref'ы. Прочитать ошибку, исправить, повторить.

- [ ] **Step 11: Прод-проверка фазы 2**

Из репо-root:
```bash
export PATH="/c/Program Files/nodejs:$PATH"
npm run dev
```

Открыть `http://localhost:5173`. Чек-лист:
- [ ] карта рендерится, лес виден (default visible.forest=true)
- [ ] hillshade виден (default visible.hillshade=true)
- [ ] клик по «Леса: вкл/выкл» в MapControls — лес скрывается/появляется
- [ ] клик «Бонитет» / «Возраст» / «Породы» — раскраска переключается
- [ ] клик «Вода», «Болота», «Почвы» — слои подгружаются (loading toast если pmtiles нет)
- [ ] клик «Доп. слои» → «ООПТ», «Дороги», «Вырубки», «Защитные», «Рельеф», «Районы» — toggle работает
- [ ] клик «Поделиться» — URL копируется, появляется toast «Ссылка скопирована»
- [ ] переключить подложку Схема → Спутник → Гибрид → OSM → Схема. Каждый раз forest перерисовывается, hillshade присутствует
- [ ] клик по любой точке карты — попап с лес/почва/вода/рельеф
- [ ] открыть `/map/выборгский-район` (или любой район) — LayerGrid чипы работают
- [ ] клик чип «Бонитет» в LayerGrid → forestColorMode переключается, видно в раскраске карты
- [ ] клик чип «Прогноз» → 18 районов раскрашиваются choropleth'ом

Если что-то не работает — `git diff` показывает что изменилось, обычно проблема в Step 5/8 (race-conditions с basemap-switch или забытый prop в MapControls).

- [ ] **Step 12: Run Playwright suite**

```bash
cd apps/web && npx playwright test
```

Expected: все 57 тестов pass. Если visual.spec.ts на `/species`/`/methodology` упали — это не связано с MapView, проверить что не задели token-палитру. Если a11y/links упали — проверить новые dom.

- [ ] **Step 13: Commit**

```bash
git add -A apps/web/src/components/MapView.tsx
git commit -m "refactor(web/mapview): фаза 2.3 — useMapLayers заменяет 12 handler'ов"
git push
```

После push — `gh run list` для проверки CI.

---

## Фаза 3: Hooks split

**Цель:** Вынести оставшуюся логику MapView в адресные хуки. После этой фазы MapView.tsx ужимается до ~150 строк (всё ещё с MapControls и inline-overlays — фазы 4 и 5 их закроют).

### Task 3.1: useMapInstance hook

**Files:**
- Create: `apps/web/src/components/mapView/hooks/useMapInstance.ts`
- Modify: `apps/web/src/components/MapView.tsx`

- [ ] **Step 1: Создать хук**

Создать `apps/web/src/components/mapView/hooks/useMapInstance.ts`:

```ts
/**
 * useMapInstance — создаёт maplibre Map ровно один раз при mount'е,
 * монтирует navigation/attribution controls, возвращает ref на Map.
 *
 * URL `?lat=&lon=&z=` парсятся при инициализации. На unmount — `m.remove()`.
 */
import { useEffect, useRef, type MutableRefObject } from "react";
import maplibregl, { Map } from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";

import { INLINE_STYLE } from "../styles/inline";

const _protocol = new Protocol();
maplibregl.addProtocol("pmtiles", _protocol.tile.bind(_protocol));

export interface InitialView {
  lat: number;
  lon: number;
  zoom: number;
}

export function parseInitialView(): InitialView {
  if (typeof window === "undefined") {
    return { lat: 60.0, lon: 30.5, zoom: 8 };
  }
  const params = new URLSearchParams(window.location.search);
  const lat = parseFloat(params.get("lat") ?? "60.0");
  const lon = parseFloat(params.get("lon") ?? "30.5");
  const zoom = parseFloat(params.get("z") ?? "8");
  return {
    lat: isFinite(lat) ? lat : 60.0,
    lon: isFinite(lon) ? lon : 30.5,
    zoom: isFinite(zoom) ? zoom : 8,
  };
}

export function useMapInstance(
  containerRef: MutableRefObject<HTMLDivElement | null>,
  initialView: InitialView,
  onReady: (map: Map) => void,
): MutableRefObject<Map | null> {
  const mapRef = useRef<Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const m = new maplibregl.Map({
      container: containerRef.current,
      style: INLINE_STYLE,
      center: [initialView.lon, initialView.lat],
      zoom: initialView.zoom,
    });
    mapRef.current = m;

    m.addControl(new maplibregl.NavigationControl(), "top-right");
    m.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );

    const onStyleReady = () => {
      if (m.isStyleLoaded()) {
        m.off("styledata", onStyleReady);
        onReady(m);
      }
    };
    m.on("styledata", onStyleReady);

    return () => {
      m.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return mapRef;
}
```

- [ ] **Step 2: Интегрировать в MapView**

В `MapView.tsx` удалить большой `useEffect` инициализации карты (~475–558). Заменить:

```tsx
  const initialView = useMemo(() => parseInitialView(), []);
  const map = useMapInstance(mapRef, initialView, (m) => {
    if (m.getLayer("places-text")) m.removeLayer("places-text");
    if (m.getSource("places")) m.removeSource("places");
    addPlaceLabelsLayer(m);
    const spots = userSpotsRef.current;
    if (spots && spots.length > 0) addUserSpotsLayer(m, spots);
  });
```

`useMemo` импортировать из `react`. Удалить старый `const map = useRef<Map | null>(null);`.

Импорты:
```tsx
import { useMapInstance, parseInitialView } from "./mapView/hooks/useMapInstance";
import { useMemo } from "react";
```

- [ ] **Step 3: Typecheck + dev smoke**

```bash
cd apps/web && npx tsc --noEmit
```
Затем `npm run dev` из root, открыть `/`. Чек: карта инициализируется, начальная позиция корректна (60, 30.5, z=8 без query, или из ?lat&lon&z).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/mapView/hooks/useMapInstance.ts apps/web/src/components/MapView.tsx
git commit -m "refactor(web/mapview): фаза 3.1 — useMapInstance"
```

---

### Task 3.2: useMapPopup hook

**Files:**
- Create: `apps/web/src/components/mapView/hooks/useMapPopup.ts`
- Modify: `apps/web/src/components/MapView.tsx`

- [ ] **Step 1: Создать хук**

Создать `apps/web/src/components/mapView/hooks/useMapPopup.ts`:

```ts
/**
 * useMapPopup — регистрирует click-handler на карте, рендерит MapLibre Popup
 * с loading-состоянием, фетчит forest/soil/water/terrain параллельно, рендерит
 * результат через buildPopupHtml.
 *
 * Пропуск: клики по самому попапу (.maplibregl-popup) — иначе re-trigger при
 * клике на ссылку внутри попапа.
 *
 * Будущее (deferred): на mobile (useIsMobile) handler диспатчит на
 * useMapBottomSheet store вместо MapLibre Popup. Расцеплено заранее.
 */
import { useEffect } from "react";
import maplibregl, { type Map } from "maplibre-gl";

import {
  fetchForestAt,
  fetchSoilAt,
  fetchWaterDistanceAt,
  fetchTerrainAt,
} from "@mushroom-map/api-client";
import { buildPopupHtml, attachPopupHandlers } from "../utils/popup";

export function useMapPopup(mapRef: React.MutableRefObject<Map | null>) {
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const handler = async (e: maplibregl.MapMouseEvent) => {
      if (!e.lngLat) return;
      if ((e.originalEvent.target as HTMLElement | null)?.closest(".maplibregl-popup")) return;
      const { lng, lat } = e.lngLat;

      const popupMaxWidth =
        window.innerWidth < 600 ? `${window.innerWidth - 32}px` : "380px";
      const popup = new maplibregl.Popup({ maxWidth: popupMaxWidth })
        .setLngLat([lng, lat])
        .setHTML(`<div style="font-family:sans-serif;color:#555;padding:4px">Загружаю…</div>`)
        .addTo(m);

      try {
        const [forest, soil, water, terrain] = await Promise.all([
          fetchForestAt(lat, lng),
          fetchSoilAt(lat, lng).catch(() => null),
          fetchWaterDistanceAt(lat, lng).catch(() => null),
          fetchTerrainAt(lat, lng).catch(() => null),
        ]);
        popup.setHTML(buildPopupHtml(forest, soil, water, terrain, lat, lng));
        const el = popup.getElement();
        if (el) attachPopupHandlers(el);
      } catch {
        popup.setHTML(`<div style="color:#c62828;font-size:12px">Ошибка загрузки данных</div>`);
      }
    };

    m.on("click", handler);
    return () => {
      m.off("click", handler);
    };
  }, [mapRef]);
}
```

- [ ] **Step 2: Интегрировать в MapView**

В `MapView.tsx` удалить inline `m.on("click", async (e) => { ... });` (внутри useMapInstance onReady или старого init effect'а). Добавить под другими хуками:

```tsx
  useMapPopup(map);
```

Импорт:
```tsx
import { useMapPopup } from "./mapView/hooks/useMapPopup";
```

Удалить ставшие неиспользуемыми импорты (`fetchForestAt`, `fetchSoilAt`, etc., `buildPopupHtml`, `attachPopupHandlers` — TS подскажет).

- [ ] **Step 3: Typecheck + smoke**

```bash
cd apps/web && npx tsc --noEmit
```
Затем `npm run dev`, проверить — клик по карте даёт попап с лес/почва/вода/рельеф.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/mapView/hooks/useMapPopup.ts apps/web/src/components/MapView.tsx
git commit -m "refactor(web/mapview): фаза 3.2 — useMapPopup"
```

---

### Task 3.3: useMapUrl hook

**Files:**
- Create: `apps/web/src/components/mapView/hooks/useMapUrl.ts`
- Modify: `apps/web/src/components/MapView.tsx`

- [ ] **Step 1: Создать хук**

Создать `apps/web/src/components/mapView/hooks/useMapUrl.ts`:

```ts
/**
 * useMapUrl — синхронизирует текущий center+zoom карты в URL query
 * (?lat&lon&z) через history.replaceState. На back/forward не реагирует
 * (одностороння — карта пишет в URL).
 */
import { useEffect } from "react";
import type { Map } from "maplibre-gl";

export function useMapUrl(mapRef: React.MutableRefObject<Map | null>) {
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const sync = () => {
      const { lat, lng } = m.getCenter();
      const z = Math.round(m.getZoom() * 10) / 10;
      const url = new URL(window.location.href);
      url.searchParams.set("lat", lat.toFixed(5));
      url.searchParams.set("lon", lng.toFixed(5));
      url.searchParams.set("z", String(z));
      history.replaceState(null, "", url.toString());
    };
    m.on("moveend", sync);
    return () => {
      m.off("moveend", sync);
    };
  }, [mapRef]);
}
```

- [ ] **Step 2: Интегрировать**

В `MapView.tsx` удалить inline `syncUrl` логику и `m.on("moveend", syncUrl)`. Добавить:

```tsx
  useMapUrl(map);
```

Импорт:
```tsx
import { useMapUrl } from "./mapView/hooks/useMapUrl";
```

- [ ] **Step 3: Typecheck + smoke**

```bash
cd apps/web && npx tsc --noEmit
```
`npm run dev`, попанить карту, проверить что URL в адресной строке обновляется.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/mapView/hooks/useMapUrl.ts apps/web/src/components/MapView.tsx
git commit -m "refactor(web/mapview): фаза 3.3 — useMapUrl"
```

---

### Task 3.4: useUserSpotsSync hook

**Files:**
- Create: `apps/web/src/components/mapView/hooks/useUserSpotsSync.ts`
- Modify: `apps/web/src/components/MapView.tsx`

- [ ] **Step 1: Создать хук**

Создать `apps/web/src/components/mapView/hooks/useUserSpotsSync.ts`:

```ts
/**
 * useUserSpotsSync — приватный layer пользователя. Не в LAYER_REGISTRY,
 * потому что управляется data-driven (props.userSpots: UserSpot[] | null),
 * а не toggle-driven.
 *
 * Поведение:
 *   null или [] → удалить layer и source
 *   ≥1 spot → если уже есть, updateUserSpots; иначе addUserSpotsLayer
 *
 * Видимость регулируется отдельно через useLayerVisibility.visible.userSpots
 * (LayerGrid чип «Сохранённые»).
 */
import { useEffect } from "react";
import type { Map } from "maplibre-gl";
import type { UserSpot } from "@mushroom-map/types";

import {
  addUserSpotsLayer,
  removeUserSpotsLayer,
  updateUserSpots,
} from "../layers/userSpots";
import { useLayerVisibility } from "../../../store/useLayerVisibility";

export function useUserSpotsSync(
  mapRef: React.MutableRefObject<Map | null>,
  spots: UserSpot[] | null,
) {
  const visible = useLayerVisibility((s) => s.visible.userSpots);

  // Add/update/remove
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const apply = () => {
      if (!spots || spots.length === 0) {
        removeUserSpotsLayer(m);
        return;
      }
      if (m.getLayer("user-spots")) {
        updateUserSpots(m, spots);
      } else {
        addUserSpotsLayer(m, spots);
      }
    };
    if (m.isStyleLoaded()) apply();
    else m.once("idle", apply);
  }, [spots, mapRef]);

  // Visibility toggle (после того как слой существует)
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !m.getLayer("user-spots")) return;
    m.setLayoutProperty("user-spots", "visibility", visible ? "visible" : "none");
  }, [visible, mapRef]);
}
```

- [ ] **Step 2: Интегрировать**

В `MapView.tsx` удалить:
- старый useEffect для userSpots (~610–627)
- useEffect для storeUserSpotsVisible (~677–685)

Заменить на:
```tsx
  useUserSpotsSync(map, userSpots);
```

Импорт:
```tsx
import { useUserSpotsSync } from "./mapView/hooks/useUserSpotsSync";
```

`userSpotsRef` всё ещё нужен — на него ссылается basemap-switch effect. Оставить.

- [ ] **Step 3: Typecheck + smoke**

```bash
cd apps/web && npx tsc --noEmit
```
`npm run dev`. Если залогинен — проверить что spots-маркеры на карте есть. Если не залогинен — слоя нет (нет error'ов в консоли).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/mapView/hooks/useUserSpotsSync.ts apps/web/src/components/MapView.tsx
git commit -m "refactor(web/mapview): фаза 3.4 — useUserSpotsSync"
```

---

### Task 3.5: useBaseMap hook

**Files:**
- Create: `apps/web/src/components/mapView/hooks/useBaseMap.ts`
- Modify: `apps/web/src/components/MapView.tsx`

- [ ] **Step 1: Создать хук**

Создать `apps/web/src/components/mapView/hooks/useBaseMap.ts`:

```ts
/**
 * useBaseMap — переключает MapLibre style при смене store.baseMap.
 * После setStyle ждёт `isStyleLoaded` через RAF-poll, затем дёргает onAfterApply
 * — там вызывающий должен пере-добавить registry-слои + places + userSpots.
 *
 * Не использует styledata listener: на медленных tile-CDN он промахивается
 * (первый firing isStyleLoaded=false, второй не приходит). RAF-poll даёт
 * предсказуемое «дождаться, потом продолжить».
 *
 * setStyle с diff: false — на тяжёлых стилях (Versatiles ≥60 layers) diff
 * оставляет визуальные артефакты. Полная замена медленнее, но детерминирована.
 */
import { useEffect, useRef } from "react";
import type { Map, StyleSpecification } from "maplibre-gl";

import { useLayerVisibility, type BaseMapMode } from "../../../store/useLayerVisibility";
import { INLINE_STYLE, SATELLITE_STYLE } from "../styles/inline";
import { buildSchemeStyle, SCHEME_STYLE_FALLBACK } from "../styles/scheme";
import { buildHybridStyle, HYBRID_STYLE_FALLBACK } from "../styles/hybrid";

export function useBaseMap(
  mapRef: React.MutableRefObject<Map | null>,
  onAfterApply: (mode: BaseMapMode) => void,
) {
  const baseMap = useLayerVisibility((s) => s.baseMap);
  const applied = useRef<BaseMapMode>("osm"); // INLINE_STYLE — 'osm'-эквивалент

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (applied.current === baseMap) return;

    let cancelled = false;

    const apply = (style: StyleSpecification) => {
      if (cancelled) return;
      m.setStyle(style, { diff: false });
      applied.current = baseMap;

      const poll = () => {
        if (cancelled) return;
        if (m.isStyleLoaded()) {
          onAfterApply(baseMap);
        } else {
          requestAnimationFrame(poll);
        }
      };
      requestAnimationFrame(poll);
    };

    if (baseMap === "scheme") {
      buildSchemeStyle().then(apply).catch(() => apply(SCHEME_STYLE_FALLBACK));
    } else if (baseMap === "hybrid") {
      buildHybridStyle().then(apply).catch(() => apply(HYBRID_STYLE_FALLBACK));
    } else {
      apply(baseMap === "satellite" ? SATELLITE_STYLE : INLINE_STYLE);
    }

    return () => { cancelled = true; };
  }, [baseMap, mapRef, onAfterApply]);
}
```

- [ ] **Step 2: Интегрировать**

В `MapView.tsx` удалить большой basemap-switch useEffect. Заменить на:

```tsx
  const handleStyleApplied = useCallback((mode: BaseMapMode) => {
    const m = map.current;
    if (!m) return;
    if (m.getLayer("places-text")) m.removeLayer("places-text");
    if (m.getSource("places")) m.removeSource("places");
    if (mode === "scheme" || mode === "hybrid") {
      addPlaceLabelsLayer(m);
    }
    const spots = userSpotsRef.current;
    if (m.getLayer("user-spots")) m.removeLayer("user-spots");
    if (m.getSource("user-spots-src")) m.removeSource("user-spots-src");
    if (spots && spots.length > 0) addUserSpotsLayer(m, spots);
    reapplyAll();
  }, [reapplyAll]);

  useBaseMap(map, handleStyleApplied);
```

Импорт:
```tsx
import { useBaseMap } from "./mapView/hooks/useBaseMap";
```

Удалить локальный `appliedBaseMap` ref — он переехал в хук.

- [ ] **Step 3: Typecheck + smoke**

```bash
cd apps/web && npx tsc --noEmit
```
`npm run dev`. Чек:
- [ ] переключить Схема → Спутник → Гибрид → OSM → Схема
- [ ] forest, hillshade, любые активные слои перерисовываются после каждого переключения
- [ ] места (places-text) видны на Схема и Гибрид, нет на Спутник и OSM

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/mapView/hooks/useBaseMap.ts apps/web/src/components/MapView.tsx
git commit -m "refactor(web/mapview): фаза 3.5 — useBaseMap"
```

- [ ] **Step 5: Полный Playwright прогон + push**

```bash
cd apps/web && npx playwright test
git push
```

После push: `gh run list` — оба workflow (deploy-web ~1 мин, deploy-api skipped потому что нет api-changes) должны быть green.

---

## Фаза 4: UI унификация — LayerGrid вместо MapControls

**Цель:** `MapControls.tsx` удалён. На overview (`/`) и в district-режиме (`/map/:district`) используется один `<LayerGrid />`. BaseMap picker и Share — отдельные floating-компоненты.

### Task 4.1: Расширить LayerGrid (primary + secondary group)

**Files:**
- Modify: `apps/web/src/components/mapView/LayerGrid.tsx`
- Modify: `apps/web/src/components/mapView/LayerGrid.module.css`

- [ ] **Step 1: Прочитать существующий LayerGrid.module.css**

```bash
cat apps/web/src/components/mapView/LayerGrid.module.css
```

Запомнить классы `grid`, `strip`, `chip`, `chipActive`, `chipDisabled`, `label`, `subLabel`. Их используем; новые добавляем рядом.

- [ ] **Step 2: Добавить CSS для secondary group**

В `apps/web/src/components/mapView/LayerGrid.module.css` дописать в конце:

```css
.secondaryToggle {
  margin-top: 8px;
  background: transparent;
  border: 1px solid var(--ink-faint, #5e5d52);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  color: var(--ink-dim, #4f4e45);
  cursor: pointer;
  width: 100%;
  text-align: left;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.secondaryToggle:hover {
  border-color: var(--ink, #1a1916);
}

.secondaryGroup {
  margin-top: 6px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}

.strip .secondaryToggle,
.strip .secondaryGroup {
  display: none; /* mobile strip — secondary недоступен */
}
```

(Если `--ink-faint` и `--ink-dim` именуются по-другому в проекте — просто использовать прямой hex `#5e5d52` / `#4f4e45`. Проверить через `grep '\-\-ink' apps/web/src/styles/`)

- [ ] **Step 3: Расширить LayerGrid.tsx**

Заменить `apps/web/src/components/mapView/LayerGrid.tsx` целиком:

```tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import {
  useLayerVisibility,
  type ForestColorMode,
} from "../../store/useLayerVisibility";
import styles from "./LayerGrid.module.css";

export interface LayerGridProps {
  className?: string;
  layout?: "grid" | "strip";
}

interface ChipDescriptor {
  key: string;
  label: string;
  active: boolean;
  onClick?: () => void;
  href?: string;
  hint?: string;
  disabled?: boolean;
}

export function LayerGrid({ className, layout = "grid" }: LayerGridProps) {
  const visible = useLayerVisibility((s) => s.visible);
  const forestColorMode = useLayerVisibility((s) => s.forestColorMode);
  const setVisible = useLayerVisibility((s) => s.setVisible);
  const toggleVisible = useLayerVisibility((s) => s.toggleVisible);
  const selectForestMode = useLayerVisibility((s) => s.selectForestMode);

  const auth = useAuth();
  const authStatus = auth.status;

  const [secondaryOpen, setSecondaryOpen] = useState(false);

  const toggleForestMode = (mode: ForestColorMode) => {
    if (visible.forest && forestColorMode === mode) setVisible("forest", false);
    else selectForestMode(mode);
  };
  const isForestActive = (mode: ForestColorMode) =>
    visible.forest && forestColorMode === mode;

  const spotsChip: ChipDescriptor =
    authStatus === "authenticated"
      ? {
          key: "userSpots",
          label: "Сохранённые",
          active: visible.userSpots,
          onClick: () => toggleVisible("userSpots"),
        }
      : {
          key: "userSpots",
          label: "Войти",
          active: false,
          href: `/auth?next=${encodeURIComponent(
            typeof window !== "undefined"
              ? window.location.pathname + window.location.search
              : "/",
          )}`,
          hint: "Сохранённые",
          disabled: authStatus === "loading",
        };

  const primaryChips: ChipDescriptor[] = [
    {
      key: "forecastChoropleth",
      label: "Прогноз",
      active: visible.forecastChoropleth,
      onClick: () => toggleVisible("forecastChoropleth"),
    },
    {
      key: "forest-species",
      label: "Породы",
      active: isForestActive("species"),
      onClick: () => toggleForestMode("species"),
    },
    {
      key: "forest-bonitet",
      label: "Бонитет",
      active: isForestActive("bonitet"),
      onClick: () => toggleForestMode("bonitet"),
    },
    {
      key: "forest-age",
      label: "Возраст",
      active: isForestActive("age_group"),
      onClick: () => toggleForestMode("age_group"),
    },
    {
      key: "soil",
      label: "Почва",
      active: visible.soil,
      onClick: () => toggleVisible("soil"),
    },
    {
      key: "hillshade",
      label: "Рельеф",
      active: visible.hillshade,
      onClick: () => toggleVisible("hillshade"),
    },
    spotsChip,
  ];

  const secondaryChips: ChipDescriptor[] = [
    { key: "waterway", label: "Водотоки", active: visible.waterway, onClick: () => toggleVisible("waterway") },
    { key: "wetland",  label: "Болота",   active: visible.wetland,  onClick: () => toggleVisible("wetland") },
    { key: "water",    label: "Водоохранные", active: visible.water, onClick: () => toggleVisible("water") },
    { key: "oopt",     label: "ООПТ",     active: visible.oopt,     onClick: () => toggleVisible("oopt") },
    { key: "roads",    label: "Дороги",   active: visible.roads,    onClick: () => toggleVisible("roads") },
    { key: "felling",  label: "Вырубки",  active: visible.felling,  onClick: () => toggleVisible("felling") },
    { key: "protective", label: "Защитные", active: visible.protective, onClick: () => toggleVisible("protective") },
    { key: "districts", label: "Районы",  active: visible.districts, onClick: () => toggleVisible("districts") },
  ];

  const containerClass = layout === "strip" ? styles.strip : styles.grid;

  return (
    <div className={className}>
      <ul className={containerClass} role="group" aria-label="Слои карты">
        {primaryChips.map((c) => (
          <li key={c.key} className={styles.item}>
            <ChipButton chip={c} />
          </li>
        ))}
      </ul>

      {layout === "grid" && (
        <>
          <button
            type="button"
            className={styles.secondaryToggle}
            onClick={() => setSecondaryOpen((o) => !o)}
            aria-expanded={secondaryOpen}
          >
            <span>Ещё слои</span>
            <span aria-hidden="true">{secondaryOpen ? "▴" : "▾"}</span>
          </button>
          {secondaryOpen && (
            <ul className={styles.secondaryGroup} role="group" aria-label="Дополнительные слои карты">
              {secondaryChips.map((c) => (
                <li key={c.key}>
                  <ChipButton chip={c} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function ChipButton({ chip }: { chip: ChipDescriptor }) {
  const className = `${styles.chip}${chip.active ? ` ${styles.chipActive}` : ""}${
    chip.disabled ? ` ${styles.chipDisabled}` : ""
  }`;
  const inner = (
    <>
      <span className={styles.label}>{chip.label}</span>
      {chip.hint ? <span className={styles.subLabel}>{chip.hint}</span> : null}
    </>
  );
  if (chip.href) {
    return (
      <Link
        to={chip.href}
        className={className}
        aria-disabled={chip.disabled || undefined}
        tabIndex={chip.disabled ? -1 : undefined}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={className}
      onClick={chip.onClick}
      aria-pressed={chip.active}
      disabled={chip.disabled}
    >
      {inner}
    </button>
  );
}
```

- [ ] **Step 4: Typecheck + smoke**

```bash
cd apps/web && npx tsc --noEmit
```
`npm run dev`, открыть `/map/<любой-район>`. Проверить:
- [ ] 7 primary chip'ов работают как раньше
- [ ] кнопка «Ещё слои» появилась, разворачивается
- [ ] 8 secondary chip'ов кликабельны, переключают слои на карте

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/mapView/LayerGrid.tsx apps/web/src/components/mapView/LayerGrid.module.css
git commit -m "refactor(web/mapview): фаза 4.1 — LayerGrid расширен secondary group"
```

---

### Task 4.2: BaseMapPicker компонент

**Files:**
- Create: `apps/web/src/components/mapView/BaseMapPicker.tsx`
- Create: `apps/web/src/components/mapView/BaseMapPicker.module.css`

- [ ] **Step 1: Создать CSS**

Создать `apps/web/src/components/mapView/BaseMapPicker.module.css`:

```css
.wrap {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 10;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(6px);
  border-radius: 7px;
  padding: 6px 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(0, 0, 0, 0.08);
  font-family: system-ui, sans-serif;
  font-size: 12px;
}

.label {
  font-size: 10px;
  color: #888;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.pillWrap {
  display: inline-flex;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 5px;
  padding: 2px;
  gap: 2px;
}

.pill {
  border: none;
  background: transparent;
  color: #666;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.pill:hover {
  color: #222;
}

.pillActive {
  background: white;
  color: #222;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

@media (max-width: 768px) {
  .wrap {
    top: 8px;
    left: 8px;
    padding: 8px 10px;
  }
  .pill {
    padding: 8px 10px;
    font-size: 12px;
    min-height: 36px;
  }
}
```

- [ ] **Step 2: Создать TSX**

Создать `apps/web/src/components/mapView/BaseMapPicker.tsx`:

```tsx
/**
 * BaseMapPicker — переключатель базовой подложки. Floating top-left.
 * Подписан на useLayerVisibility.baseMap; setBaseMap триггерит useBaseMap.
 */
import {
  useLayerVisibility,
  type BaseMapMode,
} from "../../store/useLayerVisibility";
import styles from "./BaseMapPicker.module.css";

const OPTIONS: Array<{ id: BaseMapMode; label: string }> = [
  { id: "osm", label: "OSM" },
  { id: "scheme", label: "Схема" },
  { id: "satellite", label: "Спутник" },
  { id: "hybrid", label: "Гибрид" },
];

export function BaseMapPicker() {
  const baseMap = useLayerVisibility((s) => s.baseMap);
  const setBaseMap = useLayerVisibility((s) => s.setBaseMap);

  return (
    <div className={styles.wrap}>
      <div className={styles.label}>Подложка</div>
      <div className={styles.pillWrap} role="group" aria-label="Базовая карта">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`${styles.pill}${baseMap === o.id ? ` ${styles.pillActive}` : ""}`}
            onClick={() => setBaseMap(o.id)}
            aria-pressed={baseMap === o.id}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/mapView/BaseMapPicker.tsx apps/web/src/components/mapView/BaseMapPicker.module.css
git commit -m "refactor(web/mapview): фаза 4.2 — BaseMapPicker"
```

---

### Task 4.3: ShareButton компонент

**Files:**
- Create: `apps/web/src/components/mapView/ShareButton.tsx`
- Create: `apps/web/src/components/mapView/ShareButton.module.css`
- Create: `apps/web/src/components/mapView/hooks/useMapShare.ts`

- [ ] **Step 1: Создать хук**

Создать `apps/web/src/components/mapView/hooks/useMapShare.ts`:

```ts
/**
 * useMapShare — возвращает callback, копирующий ?lat&lon&z URL текущего
 * центра/зума карты в clipboard и пускающий тост через store.shareToast.
 */
import { useCallback } from "react";
import type { Map } from "maplibre-gl";

import { useLayerVisibility } from "../../../store/useLayerVisibility";

export function useMapShare(mapRef: React.MutableRefObject<Map | null>) {
  const setShareToast = useLayerVisibility((s) => s.setShareToast);

  return useCallback(() => {
    const m = mapRef.current;
    if (!m) return;
    const { lat, lng } = m.getCenter();
    const z = Math.round(m.getZoom() * 10) / 10;
    const url = new URL(window.location.href);
    url.searchParams.set("lat", lat.toFixed(5));
    url.searchParams.set("lon", lng.toFixed(5));
    url.searchParams.set("z", String(z));
    void navigator.clipboard.writeText(url.toString()).then(() => {
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2000);
    });
  }, [mapRef, setShareToast]);
}
```

- [ ] **Step 2: Создать CSS**

`apps/web/src/components/mapView/ShareButton.module.css`:

```css
.btn {
  position: absolute;
  bottom: 28px;
  right: 12px;
  z-index: 10;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 7px;
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 600;
  color: #455a64;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  font-family: system-ui, sans-serif;
}

.btn:hover {
  background: white;
}

@media (max-width: 768px) {
  .btn {
    bottom: 12px;
    right: 8px;
    padding: 10px 14px;
    min-height: 40px;
  }
}
```

- [ ] **Step 3: Создать TSX**

`apps/web/src/components/mapView/ShareButton.tsx`:

```tsx
/**
 * ShareButton — кнопка «копировать ссылку с координатами».
 * Берёт map из контекста через prop (а не useContext), потому что
 * MapView держит ref локально.
 */
import type { Map } from "maplibre-gl";

import { useMapShare } from "./hooks/useMapShare";
import styles from "./ShareButton.module.css";

interface Props {
  mapRef: React.MutableRefObject<Map | null>;
}

export function ShareButton({ mapRef }: Props) {
  const onShare = useMapShare(mapRef);
  return (
    <button
      type="button"
      className={styles.btn}
      onClick={onShare}
      title="Скопировать ссылку на текущий вид карты"
    >
      Поделиться
    </button>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/mapView/ShareButton.tsx apps/web/src/components/mapView/ShareButton.module.css apps/web/src/components/mapView/hooks/useMapShare.ts
git commit -m "refactor(web/mapview): фаза 4.3 — ShareButton + useMapShare"
```

---

### Task 4.4: Удалить MapControls, подключить новые UI в MapView

**Files:**
- Modify: `apps/web/src/components/MapView.tsx`
- Delete: `apps/web/src/components/MapControls.tsx`

- [ ] **Step 1: Заменить рендер MapControls на новые компоненты**

В `MapView.tsx` найти `<MapControls ... />` JSX-блок и заменить на:

```tsx
      <BaseMapPicker />
      <LayerGrid layout={mobile ? "strip" : "grid"} />
      <ShareButton mapRef={map} />
```

- [ ] **Step 2: Удалить связанные с MapControls callbacks**

Удалить из MapView:
- `handleShare` (ушёл в `useMapShare`)
- proxy-thunks для toggle (`onForestToggle: () => { ... }`, и т.д. — больше не нужны, LayerGrid сам всё делает)
- `forestVisible`, `forestLoaded`, и т.п. selectors из store, которые передавались в MapControls (если больше нигде не используются — TS подскажет)

- [ ] **Step 3: Удалить импорт MapControls и сам файл**

```tsx
// Удалить строку:
// import { MapControls, BaseMapMode } from "./MapControls";
// (если BaseMapMode используется ещё — заменить импорт на:)
import type { BaseMapMode } from "../store/useLayerVisibility";
```

```bash
git rm apps/web/src/components/MapControls.tsx
```

Добавить новые импорты:
```tsx
import { BaseMapPicker } from "./mapView/BaseMapPicker";
import { LayerGrid } from "./mapView/LayerGrid";
import { ShareButton } from "./mapView/ShareButton";
```

`LayerGrid` уже импортирован где-то? Может быть — проверить.

- [ ] **Step 4: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```
Чинить ошибки. Скорее всего: orphan'ы от MapControls props в MapView; неиспользуемые store-selectors. Удалить.

- [ ] **Step 5: Прод-проверка фазы 4**

`npm run dev`. Главный визуальный смотр.

Чек-лист overview (`/`):
- [ ] BaseMapPicker появляется в top-left, 4 кнопки переключают подложку
- [ ] LayerGrid появляется (где?) — **здесь нужен UX-вопрос: куда LayerGrid положить на overview?** Так как SidebarOverview уже занимает 420px слева, LayerGrid логично положить **внутри SidebarOverview** или ПОД ним, а не как floating-overlay. Посмотреть `apps/web/src/components/sidebar/SidebarOverview.tsx`. Если в нём уже есть слот «слои» — туда. Если нет — добавить вкладку «Слои» / accordion-секцию «Слои карты».
- [ ] ShareButton появляется в bottom-right, копирует URL
- [ ] клики по primary chip'ам работают: Прогноз/Породы/Бонитет/Возраст/Почва/Рельеф/Сохранённые
- [ ] «Ещё слои» разворачивается — secondary chip'ы работают

Чек-лист district (`/map/выборгский-район`):
- [ ] LayerGrid в SidebarDistrict работает как раньше + secondary group появилась
- [ ] BaseMapPicker, ShareButton тоже видны (либо рендерим их в обоих режимах, либо только overview — решить смотря на UX)

Чек-лист mobile (DevTools 390×844 viewport):
- [ ] LayerGrid в strip-layout — горизонтально-скроллируемая лента, secondary недоступен
- [ ] BaseMapPicker компактный
- [ ] ShareButton не наезжает на NavigationControl

Если что-то выглядит сломано — внести правки в CSS / `BaseMapPicker.module.css` / `ShareButton.module.css` / `LayerGrid.module.css`. Не объединять с предыдущим коммитом — отдельный fix-commit.

- [ ] **Step 6: SidebarOverview интеграция (если LayerGrid не помещается во floating)**

Прочитать `apps/web/src/components/sidebar/SidebarOverview.tsx`. Если там нет слота для LayerGrid — добавить:

```tsx
import { LayerGrid } from "../mapView/LayerGrid";

// внутри JSX в подходящем месте (под scrubber, перед списком районов):
<section style={{ marginTop: 16 }}>
  <h3 style={{ fontSize: 12, color: "var(--ink-dim)", textTransform: "uppercase", letterSpacing: 0.5 }}>
    Слои карты
  </h3>
  <LayerGrid layout="grid" />
</section>
```

И в `MapView.tsx` для overview-режима **не** рендерить LayerGrid (он уже в Sidebar). Это можно сделать через prop: `<LayerGrid />` рендерится в MapView только когда нет sidebar (district overview, mobile). Альтернатива — рендерить везде, и Sidebar и MapView, дубль не сильно болезнен (один store).

Простейший путь: рендерить LayerGrid **только в Sidebar** (Overview + District) и **не** в MapView вообще. Тогда MapView возвращает только container + BaseMapPicker + ShareButton + overlays.

Решить смотря на UX. Если время поджимает — рендерить и там, и там (один store, синхронны).

- [ ] **Step 7: Visual baseline для overview (если был)**

Запустить:
```bash
cd apps/web && npx playwright test tests/visual.spec.ts
```

Если упадут визуальные snapshot'ы для `/` — re-record:
```bash
npx playwright test tests/visual.spec.ts --update-snapshots
```
Затем визуально сверить новые baseline'ы (`apps/web/test-results/`) — на месте ли LayerGrid, BaseMapPicker, ShareButton, не уехал ли layout.

- [ ] **Step 8: Полный Playwright прогон**

```bash
npx playwright test
```
Expected: все green.

- [ ] **Step 9: Commit + push**

```bash
git add -A
git commit -m "refactor(web/mapview): фаза 4.4 — MapControls удалён, UI унифицирован на LayerGrid+BaseMapPicker+ShareButton"
git push
```

После push — `gh run list`, проверить что `deploy-web` зелёный, прод не сломался (открыть `https://geobiom.ru`, прокликать карту).

---

## Фаза 5: Overlays out

**Цель:** Все floating tost'ы / hint'ы / cursor-readout / species-filter-badge выносятся в самостоятельные компоненты. MapView.tsx достигает целевых ≤ 80 строк.

### Task 5.1: MapOverlays компонент (тосты)

**Files:**
- Create: `apps/web/src/components/mapView/MapOverlays.tsx`
- Create: `apps/web/src/components/mapView/MapOverlays.module.css`
- Modify: `apps/web/src/components/MapView.tsx`

- [ ] **Step 1: Создать CSS**

`apps/web/src/components/mapView/MapOverlays.module.css`:

```css
.toast {
  position: absolute;
  bottom: 50px;
  left: 50%;
  transform: translateX(-50%);
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 13px;
  z-index: 30;
  font-family: system-ui, sans-serif;
  color: white;
}

.toastShare { background: #323232; }
.toastError { background: #c62828; max-width: 380px; text-align: center; font-size: 12px; }

.vpnToast {
  position: absolute;
  top: 52px;
  left: 50%;
  transform: translateX(-50%);
  background: white;
  color: #333;
  border-radius: 8px;
  padding: 14px 22px;
  font-size: 18px;
  z-index: 30;
  max-width: calc(100vw - 32px);
  text-align: center;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(0, 0, 0, 0.08);
  font-family: system-ui, sans-serif;
}

.forestHint {
  position: absolute;
  bottom: 50px;
  left: 50%;
  transform: translateX(-50%);
  background: #2e7d32;
  color: white;
  border-radius: 8px;
  padding: 14px 22px;
  font-size: 17px;
  font-family: system-ui, sans-serif;
  z-index: 30;
  max-width: calc(100vw - 32px);
  text-align: center;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  pointer-events: none;
}

.fading {
  opacity: 0;
  transition: opacity 0.8s ease;
}

@media (max-width: 768px) {
  .vpnToast { top: 90px; font-size: 16px; }
  .forestHint { bottom: 60px; font-size: 15px; }
}
```

- [ ] **Step 2: Создать TSX**

`apps/web/src/components/mapView/MapOverlays.tsx`:

```tsx
/**
 * MapOverlays — все floating-тосты карты:
 *   - shareToast: «Ссылка скопирована» (2-сек pulse, тёмный)
 *   - errorMsg: красный, 5 сек
 *   - vpnToast: «спутник может не загружаться при VPN», 3.5 сек + 0.8 fade
 *   - forestHint: «нажмите на карту для информации», 4 сек + 0.8 fade
 *
 * Подписан на store, рендерит то что активно. Lifecycle тостов остался
 * в MapView/хуках, которые его триггерят — здесь только presentation.
 */
import { useLayerVisibility } from "../../store/useLayerVisibility";
import styles from "./MapOverlays.module.css";

export function MapOverlays() {
  const errorMsg = useLayerVisibility((s) => s.errorMsg);
  const vpnToast = useLayerVisibility((s) => s.vpnToast);
  const forestHint = useLayerVisibility((s) => s.forestHint);
  const shareToast = useLayerVisibility((s) => s.shareToast);

  return (
    <>
      {shareToast && (
        <div className={`${styles.toast} ${styles.toastShare}`}>
          Ссылка скопирована
        </div>
      )}
      {errorMsg && (
        <div className={`${styles.toast} ${styles.toastError}`}>{errorMsg}</div>
      )}
      {vpnToast !== "hidden" && (
        <div className={`${styles.vpnToast}${vpnToast === "fading" ? ` ${styles.fading}` : ""}`}>
          ℹ️ Спутниковые снимки могут не загружаться при активном VPN-соединении
        </div>
      )}
      {forestHint !== "hidden" && (
        <div className={`${styles.forestHint}${forestHint === "fading" ? ` ${styles.fading}` : ""}`}>
          Нажмите на любую точку карты, чтобы увидеть подробную информацию
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Интегрировать в MapView, удалить inline JSX**

В `MapView.tsx` удалить inline `{shareToast && ...}`, `{errorMsg && ...}`, `{vpnToast !== "hidden" && ...}`, `{forestHint !== "hidden" && ...}` JSX-блоки. Заменить на:

```tsx
<MapOverlays />
```

И удалить store-selectors `errorMsg`, `vpnToast`, `forestHint`, `shareToast` — они теперь только в MapOverlays. Effects для vpnToast/forestHint fading — оставить в MapView, они triggered'ятся при baseMap change.

Импорт:
```tsx
import { MapOverlays } from "./mapView/MapOverlays";
```

- [ ] **Step 4: Typecheck + smoke**

```bash
cd apps/web && npx tsc --noEmit
```
`npm run dev`, чек: все 4 тоста появляются (clipboard, error, VPN при satellite/hybrid, forest hint при первом включении).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(web/mapview): фаза 5.1 — MapOverlays вынесен"
```

---

### Task 5.2: CursorReadout компонент

**Files:**
- Create: `apps/web/src/components/mapView/CursorReadout.tsx`
- Create: `apps/web/src/components/mapView/CursorReadout.module.css`
- Create: `apps/web/src/components/mapView/hooks/useMouseLngLat.ts`
- Modify: `apps/web/src/components/MapView.tsx`

- [ ] **Step 1: Создать хук**

`apps/web/src/components/mapView/hooks/useMouseLngLat.ts`:

```ts
/**
 * useMouseLngLat — слушает m.on('mousemove'), возвращает {lat, lon} | null.
 * На touch-устройствах не нужен — mousemove не триггерится.
 */
import { useEffect, useState } from "react";
import type { Map } from "maplibre-gl";

export function useMouseLngLat(
  mapRef: React.MutableRefObject<Map | null>,
): { lat: number; lon: number } | null {
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null);
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const handler = (e: maplibregl.MapMouseEvent) => {
      setPos({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    };
    m.on("mousemove", handler);
    return () => {
      m.off("mousemove", handler);
    };
  }, [mapRef]);
  return pos;
}
```

И добавить импорт `import maplibregl from "maplibre-gl"` или просто `import type { MapMouseEvent } from "maplibre-gl"`.

- [ ] **Step 2: CSS**

`apps/web/src/components/mapView/CursorReadout.module.css`:

```css
.box {
  position: absolute;
  bottom: 28px;
  right: 50px;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 4px;
  padding: 2px 7px;
  font-size: 11px;
  color: #555;
  font-family: monospace;
  z-index: 10;
  pointer-events: none;
}
```

- [ ] **Step 3: TSX**

`apps/web/src/components/mapView/CursorReadout.tsx`:

```tsx
/**
 * CursorReadout — мелкий бокс с координатами под курсором (desktop only).
 */
import type { Map } from "maplibre-gl";

import { useIsMobile } from "../../lib/useIsMobile";
import { useMouseLngLat } from "./hooks/useMouseLngLat";
import styles from "./CursorReadout.module.css";

interface Props {
  mapRef: React.MutableRefObject<Map | null>;
}

export function CursorReadout({ mapRef }: Props) {
  const mobile = useIsMobile();
  const cursor = useMouseLngLat(mapRef);
  if (mobile || !cursor) return null;
  return (
    <div className={styles.box}>
      {cursor.lat.toFixed(5)}, {cursor.lon.toFixed(5)}
    </div>
  );
}
```

- [ ] **Step 4: Интегрировать в MapView**

Удалить из MapView:
- `const [cursor, setCursor] = useState(...)`
- `m.on("mousemove", (e) => setCursor(...))`
- inline `{cursor && !mobile && (...)}` JSX

Заменить на:
```tsx
<CursorReadout mapRef={map} />
```

Импорт:
```tsx
import { CursorReadout } from "./mapView/CursorReadout";
```

- [ ] **Step 5: Typecheck + smoke**

```bash
cd apps/web && npx tsc --noEmit
```
`npm run dev`. Двигать мышь над картой — координаты должны бежать в bottom-right.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(web/mapview): фаза 5.2 — CursorReadout вынесен"
```

---

### Task 5.3: SpeciesFilterBadge компонент

**Files:**
- Create: `apps/web/src/components/mapView/SpeciesFilterBadge.tsx`
- Create: `apps/web/src/components/mapView/SpeciesFilterBadge.module.css`
- Modify: `apps/web/src/components/MapView.tsx`

- [ ] **Step 1: CSS**

`apps/web/src/components/mapView/SpeciesFilterBadge.module.css`:

```css
.badge {
  position: absolute;
  top: 56px;
  left: 50%;
  transform: translateX(-50%);
  background: #e8f5e9;
  border: 1px solid #a5d6a7;
  border-radius: 6px;
  padding: 5px 12px;
  font-size: 12px;
  color: #2e7d32;
  font-family: system-ui, sans-serif;
  z-index: 15;
}

.badge strong { font-weight: 600; }
```

- [ ] **Step 2: TSX**

`apps/web/src/components/mapView/SpeciesFilterBadge.tsx`:

```tsx
/**
 * SpeciesFilterBadge — пилюля «Показаны леса для: <вид>» в верху карты.
 * Активна когда useLayerVisibility.speciesFilterLabel != null.
 */
import { useLayerVisibility } from "../../store/useLayerVisibility";
import styles from "./SpeciesFilterBadge.module.css";

export function SpeciesFilterBadge() {
  const label = useLayerVisibility((s) => s.speciesFilterLabel);
  if (!label) return null;
  return (
    <div className={styles.badge}>
      Показаны леса для: <strong>{label}</strong>
    </div>
  );
}
```

- [ ] **Step 3: Интегрировать в MapView**

Удалить из MapView:
- inline `{speciesFilterLabel && ...}` JSX
- store-selector `speciesFilterLabel`

Заменить на:
```tsx
<SpeciesFilterBadge />
```

Импорт:
```tsx
import { SpeciesFilterBadge } from "./mapView/SpeciesFilterBadge";
```

- [ ] **Step 4: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(web/mapview): фаза 5.3 — SpeciesFilterBadge вынесен"
```

---

### Task 5.4: Legend self-subscribed + финальный clean-up MapView

**Files:**
- Modify: `apps/web/src/components/Legend.tsx`
- Modify: `apps/web/src/components/MapView.tsx`

- [ ] **Step 1: Сделать Legend self-subscribed**

В `apps/web/src/components/Legend.tsx` удалить `Props` interface и подписаться на store:

```tsx
import { useLayerVisibility } from "../store/useLayerVisibility";
// ...
export function Legend() {
  const colorMode = useLayerVisibility((s) => s.forestColorMode);
  const forestLoaded = useLayerVisibility((s) => s.loaded.forest);
  const forestVisible = useLayerVisibility((s) => s.visible.forest);
  const soilLoaded = useLayerVisibility((s) => s.loaded.soil);
  const soilVisible = useLayerVisibility((s) => s.visible.soil);

  if (!forestLoaded && !(soilLoaded && soilVisible)) return null;
  const mode: LegendMode = soilLoaded && soilVisible ? "soil" : "forest";
  // ... остальное тело — как раньше, использует mode + colorMode
}
```

(Если Legend имеет более сложный условие отображения — сохранить семантику текущего MapView: показывается, когда `forestLoaded || (soilLoaded && soilVisible)`.)

- [ ] **Step 2: Удалить props из MapView**

В `MapView.tsx` `<Legend mode={...} colorMode={...} />` → `<Legend />`.

- [ ] **Step 3: Финальная сверка размера MapView**

```bash
wc -l apps/web/src/components/MapView.tsx
```

Если файл всё ещё > 200 строк — сравнить с целевым шаблоном:

```tsx
import { useCallback, useMemo, useRef } from "react";
import type { Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { useIsMobile } from "../lib/useIsMobile";
import { SearchBar } from "./SearchBar";
import { Legend } from "./Legend";
import { useLayerVisibility, type BaseMapMode } from "../store/useLayerVisibility";

import { addPlaceLabelsLayer } from "./mapView/layers/places";
import { addUserSpotsLayer } from "./mapView/layers/userSpots";
import { useMapInstance, parseInitialView } from "./mapView/hooks/useMapInstance";
import { useMapLayers } from "./mapView/hooks/useMapLayers";
import { useBaseMap } from "./mapView/hooks/useBaseMap";
import { useMapPopup } from "./mapView/hooks/useMapPopup";
import { useMapUrl } from "./mapView/hooks/useMapUrl";
import { useUserSpotsSync } from "./mapView/hooks/useUserSpotsSync";

import { BaseMapPicker } from "./mapView/BaseMapPicker";
import { LayerGrid } from "./mapView/LayerGrid";
import { ShareButton } from "./mapView/ShareButton";
import { MapOverlays } from "./mapView/MapOverlays";
import { CursorReadout } from "./mapView/CursorReadout";
import { SpeciesFilterBadge } from "./mapView/SpeciesFilterBadge";
import type { UserSpot } from "@mushroom-map/types";

interface MapViewProps {
  userSpots?: UserSpot[] | null;
}

export function MapView({ userSpots = null }: MapViewProps = {}) {
  const mobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const userSpotsRef = useRef<UserSpot[] | null>(userSpots);
  userSpotsRef.current = userSpots;
  const initialView = useMemo(() => parseInitialView(), []);

  const map = useMapInstance(containerRef, initialView, (m) => {
    addPlaceLabelsLayer(m);
    const spots = userSpotsRef.current;
    if (spots && spots.length > 0) addUserSpotsLayer(m, spots);
  });

  const { reapplyAll } = useMapLayers(map);

  const onStyleApplied = useCallback((mode: BaseMapMode) => {
    const m = map.current;
    if (!m) return;
    if (m.getLayer("places-text")) m.removeLayer("places-text");
    if (m.getSource("places")) m.removeSource("places");
    if (mode === "scheme" || mode === "hybrid") addPlaceLabelsLayer(m);
    const spots = userSpotsRef.current;
    if (m.getLayer("user-spots")) m.removeLayer("user-spots");
    if (m.getSource("user-spots-src")) m.removeSource("user-spots-src");
    if (spots && spots.length > 0) addUserSpotsLayer(m, spots);
    reapplyAll();
  }, [map, reapplyAll]);

  useBaseMap(map, onStyleApplied);
  useMapPopup(map);
  useMapUrl(map);
  useUserSpotsSync(map, userSpots);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} className="map-root" />
      <BaseMapPicker />
      {!mobile && <LayerGrid layout="grid" />}
      {mobile && <LayerGrid layout="strip" />}
      <SearchBar />
      <Legend />
      <ShareButton mapRef={map} />
      <CursorReadout mapRef={map} />
      <SpeciesFilterBadge />
      <MapOverlays />
    </div>
  );
}
```

(Этот шаблон как ориентир — фактический файл может отличаться по деталям; главное чтобы все хуки / компоненты были подключены.)

- [ ] **Step 4: Удалить vpnToast/forestHint trigger effects** (если ещё не удалены)

Effects, которые при baseMap change или forest first-load дёргали `setVpnToast('visible')` / `setForestHint('visible')` — должны жить где-то. Варианты:
- В MapView (приемлемо для timing-логики)
- В useBaseMap (для vpnToast)
- В useMapLayers (для forestHint при первом успешном lazy-add forest'а)

Рекомендую перенести vpnToast в `useBaseMap` (срабатывает при `baseMap === "satellite" | "hybrid"`), forestHint — в `useMapLayers` (срабатывает при первом successful add forest'а).

В `useBaseMap.ts` после `applied.current = baseMap;`:

```ts
      if (baseMap === "satellite" || baseMap === "hybrid") {
        const setVpnToast = useLayerVisibility.getState().setVpnToast;
        setVpnToast("visible");
        setTimeout(() => setVpnToast("fading"), 3500);
        setTimeout(() => setVpnToast("hidden"), 3500 + 800);
      }
```

В `useMapLayers.ts` внутри `lazyAdd` после успешного `entry.add(m)`:

```ts
        if (entry.id === "forest") {
          const setForestHint = useLayerVisibility.getState().setForestHint;
          setForestHint("visible");
          setTimeout(() => setForestHint("fading"), 4000);
          setTimeout(() => setForestHint("hidden"), 4000 + 800);
        }
```

Это пробрасывает один-в-один поведение оригинала.

- [ ] **Step 5: Typecheck + полный smoke**

```bash
cd apps/web && npx tsc --noEmit
wc -l apps/web/src/components/MapView.tsx
```

Размер должен быть ≤ 80 (не считая imports — плюс ещё ~25 строк) ⇒ суммарно ≤ 110 строк.

`npm run dev`. Полный визуальный чек-лист:
- [ ] карта работает на `/`
- [ ] BaseMapPicker, LayerGrid, ShareButton, Legend, CursorReadout все на месте
- [ ] переключение подложки работает, тосты VPN появляются на satellite/hybrid
- [ ] toggle forest впервые → forest hint toast появляется
- [ ] клик по карте → попап
- [ ] share → toast «Ссылка скопирована»
- [ ] mobile: chip strip скроллится

- [ ] **Step 6: Playwright + commit + push**

```bash
cd apps/web && npx playwright test
git add -A
git commit -m "refactor(web/mapview): фаза 5.4 — Legend self-subscribed, MapView ужат до ≤ 80 строк"
git push
```

После push:
```bash
gh run list --limit 5
```

`deploy-web` workflow ~1 мин, должен быть green. Открыть `https://geobiom.ru` и пройти overview-чек ещё раз вживую.

---

### Task 5.5: Финальный смотр — обновление CLAUDE.md и memory

**Files:**
- Modify: `CLAUDE.md`
- Modify: `C:\Users\ikoch\.claude\projects\c--Users-ikoch-mushroom-map\memory\MEMORY.md`
- Create: `C:\Users\ikoch\.claude\projects\c--Users-ikoch-mushroom-map\memory\project_mapview_decomposition.md`

- [ ] **Step 1: Обновить CLAUDE.md секцию про MapView**

В `CLAUDE.md` найти упоминания `MapView.tsx` и `MapControls`. Заменить на актуальное описание архитектуры:

```markdown
### MapView architecture (после 2026-04-29 refactor'а)

`apps/web/src/components/MapView.tsx` — тонкий orchestrator (≤ 80 строк),
монтирует хуки и компоненты:
- `useMapInstance(containerRef, initialView, onReady)` — создаёт MapLibre Map.
- `useMapLayers(map)` — единственный controller между store и MapLibre, читает
  `LAYER_REGISTRY` (12 слоёв) + `useLayerVisibility` store. Возвращает
  `reapplyAll()` для basemap-switch'а.
- `useBaseMap(map, onAfterApply)` — setStyle + RAF-poll, дёргает onAfterApply
  для re-add'а слоёв.
- `useMapPopup(map)` — click-handler → попап с forest/soil/water/terrain.
- `useMapUrl(map)` — moveend → `?lat&lon&z` history.replaceState.
- `useUserSpotsSync(map, spots)` — приватный layer, data-driven, не в registry.
- `BaseMapPicker`, `LayerGrid` (primary 7 + secondary 8), `ShareButton`,
  `MapOverlays`, `CursorReadout`, `SpeciesFilterBadge`, `Legend` — все
  самоподписаны на store, никаких props-drilling.

**Добавить новый слой** = 1 файл `mapView/layers/foo.ts` (с
`addFooLayer` + `setFooVisibility`) + 1 запись в `mapView/registry.ts`.
Никаких правок MapView.tsx.
```

- [ ] **Step 2: Обновить MEMORY.md индекс**

Заменить устаревшую заметку про MapView (если есть) или добавить:

```markdown
- [MapView decomposition](project_mapview_decomposition.md) — DONE 2026-04-29: 837 → ≤ 80 строк, registry-driven, MapControls удалён, добавление слоя = 1 файл + 1 запись
```

- [ ] **Step 3: Создать project memory file**

`C:\Users\ikoch\.claude\projects\c--Users-ikoch-mushroom-map\memory\project_mapview_decomposition.md`:

```markdown
---
name: MapView decomposition
description: DONE 2026-04-29 — MapView.tsx 837 → ≤ 80 строк через registry + hooks-split + UI-унификацию.
type: project
---

5 фаз реализованы (5 коммитов на main):
1. store schema (errorMsg, ui-flags, baseMap, speciesFilter)
2. LAYER_REGISTRY + useMapLayers (заменил 12 handler'ов)
3. hooks-split (useMapInstance, useMapPopup, useMapUrl, useUserSpotsSync, useBaseMap)
4. UI унификация: MapControls удалён, LayerGrid extends to primary+secondary,
   BaseMapPicker и ShareButton — отдельные floating-компоненты
5. overlays out (MapOverlays, CursorReadout, SpeciesFilterBadge),
   Legend self-subscribed

**Why:** добавление слоя теперь = 1 файл + 1 запись в реестре, никаких
правок MapView. Дрейф control plane (MapControls vs LayerGrid) устранён —
single source of truth = `useLayerVisibility` store.

**How to apply:** При работе с картой — править layer-modules или registry,
не MapView. State карты — только через store, никаких useState в новых
map-компонентах. Если нужно добавить тост — расширить store + MapOverlays.

Спека: docs/superpowers/specs/2026-04-29-mapview-decomposition-design.md
План: docs/superpowers/plans/2026-04-29-mapview-decomposition.md
```

- [ ] **Step 4: Commit docs**

```bash
git add CLAUDE.md
git commit -m "docs(claude): обновлена секция MapView architecture после refactor'а"
git push
```

- [ ] **Step 5: Финальная проверка прода**

```bash
gh run list --limit 5
```

После того как `deploy-web` стал green — открыть `https://geobiom.ru`, пройти все клики ещё раз. Это **финальная** прод-валидация всех 5 фаз.

---

## Self-review (для агента, исполняющего план)

Перед началом — пройти этот чек-лист, чтобы быть уверенным, что план целостный:

1. **Спек covered:** Каждая секция спеки имеет соответствующую задачу?
   - ✅ Расширенный store → Phase 1
   - ✅ LAYER_REGISTRY → Task 2.1
   - ✅ Хуки (useMapLayers, useBaseMap, useMapPopup, useMapUrl) → Phase 3
   - ✅ MapControls удаляется, LayerGrid расширяется → Phase 4
   - ✅ Overlays вынесены, Legend self-subscribed → Phase 5
   - ✅ Метрики: ≤ 80 строк, добавление слоя = 1 файл + 1 запись → Task 5.4 verifies, project_mapview_decomposition.md zапишет

2. **Placeholders:** Я просканировал — нет «TBD», нет «add error handling», все шаги имеют конкретный код или конкретные команды.

3. **Type consistency:** `useMapLayers` возвращает `{ reapplyAll }` — используется в `useBaseMap` callback. `BaseMapMode` экспортируется из `useLayerVisibility.ts` (фаза 1.3) — используется в фазах 2.3, 3.5, 4.4. `LayerEntry`/`RegistryLayerKey` в Task 2.1 — используется в Task 2.2.

4. **Зависимости между задачами:** 1 → 2 → 3 → 4 → 5 строго последовательно. Внутри фазы 3 порядок: 3.1 (instance) → 3.2/3.3/3.4 (можно в любом порядке) → 3.5 (последний, потому что reapplyAll нужен от useMapLayers, который добавлен в 2.2). Внутри фазы 4: 4.1 (LayerGrid) → 4.2 (BaseMapPicker) → 4.3 (ShareButton) → 4.4 (интеграция и удаление MapControls).

5. **Скоп:** Этот план — один subsystem (карта). Не разбивать дальше.

---

## Открытые UX-решения (на момент выполнения)

Эти решения принимает агент-исполнитель в рамках задач — не требуют возврата к пользователю:

1. **LayerGrid на overview** — Sidebar или floating? **Решение:** добавляем секцию «Слои карты» в `SidebarOverview`, в MapView оставляем `<LayerGrid />` только когда нет sidebar (mobile/district). Если SidebarOverview не позволяет — рендерим в обоих местах (один store).
2. **Share позиционирование на mobile** — bottom-right может конфликтовать с zoom-controls. **Решение:** на mobile двигаем `ShareButton` в bottom-left (см. CSS в Task 4.3, можно подправить).
3. **vpnToast/forestHint trigger** — переезд в хуки. **Решение:** vpnToast в `useBaseMap`, forestHint в `useMapLayers` (см. Task 5.4 Step 4).
