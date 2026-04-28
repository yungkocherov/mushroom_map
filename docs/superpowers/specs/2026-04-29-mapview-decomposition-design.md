# MapView decomposition — design

Дата: 2026-04-29
Автор: Claude (brainstorming session)
Статус: draft, ждёт review пользователем

## Проблема

`apps/web/src/components/MapView.tsx` — 837 строк, концентрирует:
- 24 локальных `useState` (12 слоёв × `visible/loaded`) + 24 зеркальных `useRef`
- 12 почти-копий handler'ов (`handleForestToggle`, `handleSoilToggle`, …)
- 60-строчный `setupForestAndInteractions` с copy-paste для каждого слоя
- двойной control plane: legacy `MapControls` (props-driven) + `useLayerVisibility` store (4 sync-effect'а), с явно зафиксированным дрейфом
- смешение orchestration карты, lazy-load PMTiles, popup-click, share-URL, toast/hint UI

Цена удержания статуса:
- **добавление 13-го слоя** = 6 правок в MapView (`useState`, `useRef`, sync-effect, setup-block, toggle, props в MapControls)
- **дрейф состояния** между MapControls и LayerGrid воспроизводим (юзер кликает чип в SidebarDistrict — MapControls не обновляется)
- **тестируемость**: ничего не мокается без полного MapLibre + jsdom
- **mobile BottomSheet** не вкатывается без расцепления popup-логики

## Цели

1. Единый источник правды для состояния слоёв (`useLayerVisibility` store).
2. Декларативное добавление новых слоёв (1 файл + 1 запись в реестре, без правки MapView).
3. Унифицированная UI-плоскость переключателей слоёв (`LayerGrid` везде, `MapControls` удалён).
4. Расцепление popup-логики так, чтобы её можно было адресно подменить на BottomSheet на мобайле.
5. MapView.tsx ≤ 80 строк (тело компонента), читается как orchestrator.

Не-цели:
- переписывание layer-modules (`layers/forest.ts`, `layers/water.ts`, …) — они уже на правильном уровне абстракции.
- замена MapLibre/PMTiles или basemap-стилей.
- покрытие unit-тестами всего map-stack'а — это требует jsdom-моков MapLibre, которых у проекта нет; ограничиваемся тестами стора и реестра.

## Архитектура

### Источник правды: расширенный `useLayerVisibility`

Store уже декларирует все 13 ключей слоёв (`forest`, `water`, `waterway`, `wetland`, `oopt`, `roads`, `felling`, `protective`, `soil`, `hillshade`, `districts`, `forecastChoropleth`, `userSpots`) в виде `Record<LayerKey, boolean>` для `visible` и `loaded`. После рефакторинга он становится:

- единственным держателем состояния для всех слоёв (никаких `useState` в MapView)
- держателем `errorMsg` (currently inline state в MapView)
- держателем `forestColorMode` (уже есть)
- держателем UI-флагов: `vpnToast`, `forestHint`, `shareToast`, `speciesFilterLabel` (currently inline в MapView) — эти можно вынести в отдельный `useMapOverlays` store, но т.к. они тривиальны, держим всё в `useLayerVisibility` под секцией `ui:`. **Решение по вопросу обсудить в плане реализации, не в спеке.**

Actions, которые должны появиться:
- `setLayerVisible(key, value)` (есть как `setVisible`)
- `toggleLayer(key)` (есть как `toggleVisible`)
- `setLayerLoaded(key, value)` (есть как `setLoaded`)
- `setErrorMsg(msg | null)`
- `requestLayer(key)` — атомарная операция «если loaded, toggle visibility; если не loaded, mark visible+loaded one-shot». HEAD-проверка живёт **не** в store (store — pure), а в `useMapLayers` хуке.

### Реестр слоёв: `apps/web/src/components/mapView/registry.ts`

Декларативное описание всех 12 слоёв (`userSpots` обрабатывается отдельно — у него data-driven update, не toggle):

```ts
type LayerEntry = {
  id: LayerKey;
  /** PMTiles файл; null = слой через GeoJSON API (districts) или встроенно (places) */
  pmtiles: string | null;
  missingMsg: string | null; // показывается если HEAD упал
  add: (m: Map) => void;
  setVisibility: (m: Map, v: boolean) => void;
  /** Все source-id и layer-id, которые слой создаёт. Нужно для cleanup при basemap-switch. */
  sources: string[];
  layers: string[];
};

export const LAYER_REGISTRY: LayerEntry[] = [
  { id: 'forest', pmtiles: 'forest.pmtiles', ..., add: addForestLayer, setVisibility: setForestVisibility,
    sources: ['forest'], layers: ['forest-fill'] },
  { id: 'water', pmtiles: 'water.pmtiles', ..., sources: ['water'], layers: ['water-fill'] },
  { id: 'roads', ..., sources: ['roads'], layers: ['roads-line', 'roads-casing'] },
  // и т.д. — 12 записей
];
```

Реестр заменяет:
- 12 копий handler'ов в MapView (`handleForestToggle` и т.д.)
- 60-строчный body `setupForestAndInteractions`
- 12 веток `if (loadedRef.current)` в нём

### Хуки

Все хуки живут в `apps/web/src/components/mapView/hooks/`.

**`useMapInstance(containerRef, initialView): MutableRefObject<Map | null>`**
Создаёт MapLibre Map ровно один раз, `addControl(NavigationControl)`, `addControl(AttributionControl)`. Возвращает ref. Обработка `?lat=&lon=&z=` query-параметров инициализации.

**`useBaseMap(map, mode)`**
Owns `setStyle` + RAF-poll до `isStyleLoaded`. После успешного применения стиля вызывает callback (передаётся через параметры или ref) для re-add'а слоёв из `LAYER_REGISTRY`. Не знает про слои сам — берёт через event-bus или callback.

**`useMapLayers(map)`**
Главный controller-хук:
- Подписывается на `useLayerVisibility` (`visible`, `loaded`, `forestColorMode`).
- При `visible[key]=true && !loaded[key]` — запускает HEAD-check на `${TILES_BASE}/${pmtiles}`, при ok вызывает `entry.add(map)`, ставит `loaded=true`. При fail — пишет `errorMsg`, откатывает `visible`.
- При `visible[key]=true && loaded[key]` — `entry.setVisibility(map, true)`.
- При `visible[key]=false && loaded[key]` — `entry.setVisibility(map, false)`.
- Owns re-apply после basemap-switch'а: при сигнале от `useBaseMap` пробегает реестр, для каждого `loaded` слоя удаляет sources/layers (чтобы избежать stale state из diff'а setStyle) и заново `entry.add(map)`.
- При `forestColorMode` change — `m.setPaintProperty('forest-fill', 'fill-color', paint)`.

Это единственный хук, который реально дёргает MapLibre add/remove/setVisibility. Все остальные модули (LayerGrid, sidebar) только пишут в store.

**`useMapPopup(map)`**
Регистрирует `m.on('click', handler)`, который:
- проверяет, что клик не по `.maplibregl-popup` (иначе re-trigger при клике на сам попап)
- параллельно фетчит `fetchForestAt/Soil/Water/Terrain`
- рендерит `buildPopupHtml(...)` через `attachPopupHandlers`

В будущем (deferred — phase 6, после этого refactor'а) добавляется флаг `mode: 'popup' | 'bottom-sheet'` через `useIsMobile`, и на мобайле hander диспатчит на zustand-сторе `useMapBottomSheet.open(data)` вместо MapLibre Popup. **В рамках этого refactor'а** — только меняется shape так, что эта подмена тривиальна.

**`useMapUrl(map)`**
`m.on('moveend', syncUrl)` — пишет `?lat=&lon=&z=` в `history.replaceState`.

**`useMapShare(map)`**
Возвращает callback `() => void`, который копирует текущий center/zoom URL в clipboard и пишет `shareToast` в store.

**`useMapSpeciesFilter(map)`**
Слушает store `speciesFilter` и применяет `m.setFilter('forest-fill', ...)`. Также экспонирует callback `setFilter(forestTypes, label)`.

### UI-компоненты

**`LayerGrid` (расширенный):**
сейчас 7 чипов. После рефакторинга расширяется по группам:
- **Primary** (всегда видны): 7 текущих (`Прогноз`, `Породы`, `Бонитет`, `Возраст`, `Почва`, `Рельеф`, `Сохранённые`).
- **Secondary** (под `<details>` disclosure «Ещё слои»): 8 legacy (`Вода`, `Водотоки`, `Болота`, `ООПТ`, `Дороги`, `Вырубки`, `Защитные`, `Районы`).

`MapControls.tsx` **удаляется** целиком. На overview (`/`) и в district-режиме рендерится один `<LayerGrid />` с одинаковым API; layout-prop (`grid` / `strip`) различает desktop vs mobile.

**Outflows из MapView (новые компоненты):**
- `MapOverlays.tsx` — все toast'ы и hint'ы (share, error, vpn, forest-hint). Подписывается на store, рисует floating overlays.
- `CursorReadout.tsx` — координаты под курсором (desktop only). Подписывается на `useMapEvents` хук, который сам слушает `m.on('mousemove')`.
- `SpeciesFilterBadge.tsx` — бейдж активного фильтра.
- `BaseMapPicker.tsx` — 4 кнопки scheme/satellite/hybrid/osm. Floating top-left, как сейчас в `MapControls`.
- `ShareButton.tsx` — кнопка «копировать ссылку с координатами». Floating top-right или внутри `MapOverlays`. Использует `useMapShare(map)`.

**`SearchBar`** не трогаем — он работает поверх компонента, не внутри.

**`Legend`** — остаётся, но переподписывается напрямую на `useLayerVisibility` (`forestColorMode`, `visible.soil`, `loaded.forest`) вместо props-drilling.

### MapView.tsx после refactor'а

```tsx
export function MapView({ userSpots = null }: MapViewProps = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const map = useMapInstance(containerRef, parseInitialView());

  useBaseMap(map);          // setStyle + RAF-poll, dispatches reapply
  useMapLayers(map);        // registry-driven, single source
  useMapPopup(map);         // click → popup
  useMapUrl(map);           // moveend → ?lat&lon&z
  useUserSpotsSync(map, userSpots); // userSpots — data-driven, отдельно от registry

  return (
    <div className="map-view">
      <div ref={containerRef} className="map-root" />
      <BaseMapPicker />
      <LayerGrid layout={mobile ? 'strip' : 'grid'} />
      <SearchBar />
      <Legend />
      <MapOverlays />
      <CursorReadout />
      <SpeciesFilterBadge />
      <ShareButton />
    </div>
  );
}
```

Целевой размер: **≤ 80 строк** (включая imports). Всё остальное — в хуках/компонентах.

## Поток данных

### Toggle слоя
1. Пользователь кликает чип в `LayerGrid`.
2. `LayerGrid` вызывает `store.toggleVisible('forest')`.
3. `useMapLayers` ловит изменение через селектор `(s) => s.visible.forest`.
4. Если `loaded.forest === false`: HEAD-check `forest.pmtiles`. ok → `addForestLayer(m)` + `setLoaded('forest', true)` + `setForestVisibility(m, true)`. fail → `setErrorMsg(...)` + `setVisible('forest', false)` (rollback).
5. Если `loaded.forest === true`: просто `setForestVisibility(m, value)`.

### Basemap switch
1. `MapControls` (или новый `BaseMapPicker` — отдельный компонент с 4 кнопками scheme/satellite/hybrid/osm) вызывает `setBaseMap(mode)`.
2. `useBaseMap` ловит изменение, билдит style spec, дёргает `m.setStyle(spec, { diff: false })`.
3. RAF-poll до `m.isStyleLoaded()`.
4. Сигнал `useMapLayers` re-apply'нуть. `useMapLayers` пробегает реестр, для каждого `loaded` слоя: удаляет sources/layers, `entry.add(map)`, `entry.setVisibility(map, visible[id])`.

### Popup click
1. `useMapPopup` ловит `m.on('click')`.
2. Создаёт MapLibre Popup с loading-spinner.
3. Параллельно фетчит API endpoints.
4. `popup.setHTML(buildPopupHtml(...))` + `attachPopupHandlers`.

### URL sync
1. `m.on('moveend')` → `useMapUrl` пишет `?lat&lon&z` через `history.replaceState`.
2. При маунте — `useMapInstance` читает initial view из URL.

## Обработка ошибок

- **HEAD pmtiles fails** → `setErrorMsg`, store flag `errorMsg` подхватывается `MapOverlays.tsx`, рисует красный toast 5 секунд.
- **API fetch fails в popup** → попап рендерит `<div style="color:#c62828">Ошибка загрузки данных</div>`. То же поведение что сейчас.
- **Basemap fetch fails** (Versatiles/ESRI вернули 5xx) → `useBaseMap` ловит promise rejection, fallback'ится на `SCHEME_STYLE_FALLBACK`/`HYBRID_STYLE_FALLBACK` — то же поведение что сейчас.
- **Map в `null`-state** (компонент unmount'ился) — все хуки проверяют `map.current` и тихо возвращаются.

## Тестирование

### Unit (Vitest, нет MapLibre)
- `useLayerVisibility` — actions, default state, rollback при HEAD-fail (mock fetch).
- `LAYER_REGISTRY` — все 12 entry имеют валидные shape'ы (TS типы + runtime assertion в test'е).

### Integration (Playwright, host dev server)
- `tests/map-layers.spec.ts` (новый) — клик по чипу → MapLibre canvas рисуется (через `await page.waitForFunction(() => window.maplibreInstance?.getLayer('forest-fill'))` — exposeн в dev только).
- Существующие `tests/visual.spec.ts` baselines на `/species`, `/methodology` — не должны падать.
- `/` (overview) — visual baseline **не записываем** (MapLibre non-deterministic), но добавляем smoke-тест: чипы кликабельны, тосты появляются.

### Ручная регрессия
После каждой фазы deploy на дев + прогон по чек-листу:
- [ ] basemap: scheme → satellite → hybrid → osm → scheme (forest перерисовывается каждый раз)
- [ ] forest: toggle off → on, color mode species → bonitet → age
- [ ] hillshade: toggle on → видно
- [ ] click по карте → попап с forest+soil+water+terrain
- [ ] share button → URL в clipboard
- [ ] move карты → URL обновляется
- [ ] mobile: chip strip скроллится, popup помещается

## Фазы реализации (5 коммитов)

Каждая фаза = отдельный коммит на main. Прод-проверка после каждого. Если что-то ломается через сутки — `git revert` ровно одной фазы.

### Фаза 1: store schema (1 commit)
- Добавить `errorMsg`, `setErrorMsg` actions в `useLayerVisibility`.
- Добавить vitest unit-тесты (toggleVisible, selectForestMode, errorMsg lifecycle).
- MapView пока не переиспользует ничего нового — продолжает свою inline-логику.
- **Прод не меняется визуально.**

### Фаза 2: layer registry + `useMapLayers` (1 commit)
- Создать `mapView/registry.ts` (12 entries).
- Создать `mapView/hooks/useMapLayers.ts`.
- В MapView заменить 12 toggle-handler'ов + sync-effects на один `useMapLayers(map)` call.
- `setupForestAndInteractions` режется до 5 строк.
- 24 useState/useRef удаляются — вся state в store.
- `MapControls` всё ещё рендерится, но его callback'и теперь дёргают store actions, а не локальные setters.
- **Прод визуально не меняется.** Главный риск: race-condition в basemap-switch + reapply. Тщательная ручная проверка.

### Фаза 3: hooks split (1 commit)
- Выносим `useBaseMap`, `useMapPopup`, `useMapUrl`, `useMapShare`, `useMapSpeciesFilter`.
- MapView ужимается до ~120 строк.
- **Прод визуально не меняется.**

### Фаза 4: UI unification (1 commit)
- `LayerGrid` расширяется: primary group + `<details>` disclosure для secondary.
- В `MapView` `<MapControls />` заменяется на `<LayerGrid />`.
- `MapControls.tsx` удаляется.
- BaseMap picker (4 кнопки scheme/satellite/hybrid/osm) — выносится в новый компонент `BaseMapPicker.tsx`, рендерится рядом с LayerGrid (или внутри как ещё одна группа? — решить в плане).
- **Прод визуально меняется** на overview. Ручной checklist: open `/`, проверить что:
  - все 7 primary chip'ов работают
  - secondary disclosure открывается, 8 legacy chip'ов работают
  - basemap picker работает
  - layout не сломан на 1280×800 и 390×844
- Пере-record visual baseline для desktop overview если был.

### Фаза 5: overlays out (1 commit)
- Выносим `MapOverlays.tsx`, `CursorReadout.tsx`, `SpeciesFilterBadge.tsx`.
- MapView.tsx достигает целевых ≤ 80 строк.
- Все inline-стили удалены, переезжают в CSS modules или Tailwind (consistency с остальным фронтом).
- **Прод визуально не меняется.**

## Риски

1. **Basemap-switch race** — самое больное место текущего кода. RAF-polling после `setStyle` + recreation всех слоёв из реестра — строго следовать паттерну, не оптимизировать «он уже loaded, не надо re-add'ить» (диффы setStyle оставляют source без layer'а).
2. **Visual baselines** — Playwright snapshot'ы на `/species`, `/methodology` не пострадают. На `/` baseline'а нет (MapLibre non-deterministic) → ручная проверка после фазы 4.
3. **userSpots — data-driven, не toggle-driven**. Не вкатывать его в registry, держать отдельный `useUserSpotsSync` хук (data → addLayer/updateUserSpots/removeUserSpotsLayer).
4. **forecastChoropleth lazy-load на main `/`** — currently триггерится через `MapHomePage` useEffect (см. memory). После рефакторинга `useMapLayers` сам подхватит `visible.forecastChoropleth=true` из дефолта — проверить что он действительно стартует включённым на overview.
5. **MapControls удаление** — в `MapView.tsx` есть зависимости (`baseMap`/`setBaseMap`, share callback). Все они переезжают в новые места. Гарантировать grep'ом, что после удаления нет orphan-imports.

## Открытые вопросы (решить в плане реализации)

1. UI-флаги (`vpnToast`, `forestHint`, `shareToast`, `speciesFilterLabel`) — в `useLayerVisibility` или отдельный `useMapUI` store?
2. `useUserSpotsSync` — отдельный хук или часть `useMapLayers`?
3. Share-button и BaseMapPicker позиционируются абсолютно (как сейчас) или внутри `LayerGrid`-области? UX-вопрос — оставляю на этап Фазы 4 при визуальной проверке.

## Метрики успеха

- MapView.tsx уменьшается с 837 до ≤ 80 строк (компонент-функция; не считая imports).
- Добавление 13-го слоя = 1 файл `layers/foo.ts` + 1 запись в `registry.ts`. Никаких правок в MapView.
- `LayerGrid` чип-клик и `MapControls`-кнопка-клик дают одно и то же видимое поведение (после фазы 4 они даже физически один компонент).
- Все existing Playwright тесты (a11y, links, visual) — green.
- Прод не получает регрессий по ручному чек-листу выше.
