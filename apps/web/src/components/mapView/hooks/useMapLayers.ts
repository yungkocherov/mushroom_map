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
 * Композирует MapLibre-filter для forest-fill из двух источников:
 *   - speciesFilter (legacy от Spotlight — массив slug'ов dominant_species)
 *   - legendFilter (V4.2 от Legend — значения в зависимости от mode:
 *     species=slug, bonitet=number, age_group=string)
 *
 * Оба применяются с AND-семантикой если оба заданы (полигон должен
 * подходить под все активные критерии). Property name выбирается по
 * `forestColorMode` для legendFilter.
 */
function buildForestFilter(
  mode: ForestColorMode,
  species: string[] | null,
  legend: Array<string | number> | null,
): unknown {
  const clauses: unknown[] = [];
  if (species && species.length > 0) {
    clauses.push(["in", ["get", "dominant_species"], ["literal", species]]);
  }
  if (legend && legend.length > 0) {
    const prop =
      mode === "bonitet" ? "bonitet" :
      mode === "age_group" ? "age_group" :
      "dominant_species";
    clauses.push(["in", ["get", prop], ["literal", legend]]);
  }
  if (clauses.length === 0) return null;
  if (clauses.length === 1) return clauses[0];
  return ["all", ...clauses];
}

export function useMapLayers(
  mapRef: React.MutableRefObject<Map | null>,
  ready: boolean,
) {
  const visible = useLayerVisibility((s) => s.visible);
  const loaded = useLayerVisibility((s) => s.loaded);
  const forestColorMode = useLayerVisibility((s) => s.forestColorMode);
  const speciesFilter = useLayerVisibility((s) => s.speciesFilter);
  const legendFilter = useLayerVisibility((s) => s.legendFilter);
  const setLoaded = useLayerVisibility((s) => s.setLoaded);
  const setVisible = useLayerVisibility((s) => s.setVisible);
  const setErrorMsg = useLayerVisibility((s) => s.setErrorMsg);

  const inFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    LAYER_REGISTRY.forEach((entry) => {
      const wantVisible = visible[entry.id];
      const isLoaded = loaded[entry.id];

      if (wantVisible && !isLoaded && !inFlightRef.current.has(entry.id)) {
        void lazyAdd(m, entry);
      } else if (isLoaded) {
        applyVisibility(m, entry, wantVisible);
      }
    });

    async function lazyAdd(capturedMap: Map, entry: LayerEntry) {
      inFlightRef.current.add(entry.id);
      let mustReleaseInFlight = true;
      try {
        if (entry.pmtiles) {
          const resp = await fetch(`${TILES_BASE}/${entry.pmtiles}`, { method: "HEAD" });
          // Карту могли пересоздать (HMR / route swap) пока мы ждали HEAD;
          // не трогаем устаревший instance — это валилось ошибками при
          // basemap-switch'ах на flaky-сети.
          if (mapRef.current !== capturedMap) return;
          if (!resp.ok) {
            setErrorMsg(entry.missingMsg ?? `Слой "${entry.id}" недоступен`);
            setTimeout(() => setErrorMsg(null), 5000);
            setVisible(entry.id, false);
            return;
          }
        }
        // Re-read user intent: store may have flipped to false during HEAD await.
        // Layer-modules' add() are idempotent (getLayer guard), so even adding +
        // immediately hiding is fine; but skipping the work when not wanted is cleaner.
        const doAdd = () => {
          try {
            if (mapRef.current !== capturedMap) return;
            const stillWanted = useLayerVisibility.getState().visible[entry.id];
            entry.add(capturedMap);
            setLoaded(entry.id, true);
            entry.setVisibility(capturedMap, stillWanted);
          } finally {
            inFlightRef.current.delete(entry.id);
          }
        };
        if (capturedMap.isStyleLoaded()) {
          doAdd();
        } else {
          capturedMap.once("idle", doAdd);
        }
        mustReleaseInFlight = false; // doAdd will release it
      } catch {
        if (mapRef.current === capturedMap) {
          setErrorMsg(`Не удалось проверить ${entry.pmtiles ?? entry.id}`);
          setTimeout(() => setErrorMsg(null), 4000);
          setVisible(entry.id, false);
        }
      } finally {
        if (mustReleaseInFlight) inFlightRef.current.delete(entry.id);
      }
    }

    function applyVisibility(m: Map, entry: LayerEntry, value: boolean) {
      if (entry.layers.every((l) => m.getLayer(l))) {
        entry.setVisibility(m, value);
      } else {
        m.once("idle", () => {
          // Re-read store: visible may have flipped between scheduling and idle.
          const latest = useLayerVisibility.getState().visible[entry.id];
          if (entry.layers.every((l) => m.getLayer(l))) {
            entry.setVisibility(m, latest);
          }
        });
      }
    }
  }, [visible, loaded, mapRef, ready, setLoaded, setVisible, setErrorMsg]);

  // forestColorMode + speciesFilter применяются к forest-fill —
  // единственному forest-слою на всех зумах z=5..13 (single
  // forest.pmtiles, tippecanoe coalesce-densest сам делает per-zoom
  // drop'ы крупнейших полигонов).
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const color = paintForMode(forestColorMode);
    if (m.getLayer("forest-fill")) m.setPaintProperty("forest-fill", "fill-color", color);
  }, [forestColorMode, mapRef, ready, loaded.forest]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const filter = buildForestFilter(forestColorMode, speciesFilter, legendFilter);
    // V4.5: forest-fill добавляется лениво (после HEAD-check pmtiles).
    // Если slug в store пришёл из share-URL bootstrap'а ДО того как
    // layer существует — раньше setFilter молча пропускался и юзеру
    // приходилось дёргать toggle вручную. Теперь дополнительно
    // подписываемся на loaded.forest — когда становится true, паint
    // и filter применяются повторно.
    if (m.getLayer("forest-fill")) {
      m.setFilter("forest-fill", filter as never);
    }
  }, [speciesFilter, legendFilter, forestColorMode, mapRef, ready, loaded.forest]);

  const reapplyAll = useCallback(() => {
    const m = mapRef.current;
    if (!m) return;

    LAYER_REGISTRY.forEach((entry) => {
      if (!loaded[entry.id]) return; // never lazy-added; nothing to re-apply
      // setStyle({ diff: false }) уже снёс layers + sources, но defensive guard:
      entry.layers.forEach((l) => {
        if (m.getLayer(l)) m.removeLayer(l);
      });
      entry.sources.forEach((s) => {
        if (m.getSource(s)) m.removeSource(s);
      });
      entry.add(m);
      entry.setVisibility(m, visible[entry.id]);
    });

    const color = paintForMode(forestColorMode);
    const filter = buildForestFilter(forestColorMode, speciesFilter, legendFilter);
    if (m.getLayer("forest-fill")) {
      m.setPaintProperty("forest-fill", "fill-color", color);
      m.setFilter("forest-fill", filter as never);
    }
  }, [mapRef, loaded, visible, forestColorMode, speciesFilter, legendFilter]);

  return { reapplyAll };
}
