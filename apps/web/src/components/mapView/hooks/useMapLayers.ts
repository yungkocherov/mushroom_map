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

export function useMapLayers(
  mapRef: React.MutableRefObject<Map | null>,
  ready: boolean,
) {
  const visible = useLayerVisibility((s) => s.visible);
  const loaded = useLayerVisibility((s) => s.loaded);
  const forestColorMode = useLayerVisibility((s) => s.forestColorMode);
  const speciesFilter = useLayerVisibility((s) => s.speciesFilter);
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

    async function lazyAdd(m: Map, entry: LayerEntry) {
      inFlightRef.current.add(entry.id);
      let mustReleaseInFlight = true;
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
        // Re-read user intent: store may have flipped to false during HEAD await.
        // Layer-modules' add() are idempotent (getLayer guard), so even adding +
        // immediately hiding is fine; but skipping the work when not wanted is cleaner.
        const doAdd = () => {
          try {
            const stillWanted = useLayerVisibility.getState().visible[entry.id];
            entry.add(m);
            setLoaded(entry.id, true);
            entry.setVisibility(m, stillWanted);
          } finally {
            inFlightRef.current.delete(entry.id);
          }
        };
        if (m.isStyleLoaded()) {
          doAdd();
        } else {
          m.once("idle", doAdd);
        }
        mustReleaseInFlight = false; // doAdd will release it
      } catch {
        setErrorMsg(`Не удалось проверить ${entry.pmtiles ?? entry.id}`);
        setTimeout(() => setErrorMsg(null), 4000);
        setVisible(entry.id, false);
      } finally {
        if (mustReleaseInFlight) inFlightRef.current.delete(entry.id);
      }
    }

    function applyVisibility(m: Map, entry: LayerEntry, value: boolean) {
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
  }, [visible, loaded, mapRef, ready, setLoaded, setVisible, setErrorMsg]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !m.getLayer("forest-fill")) return;
    m.setPaintProperty("forest-fill", "fill-color", paintForMode(forestColorMode));
  }, [forestColorMode, mapRef, ready]);

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
  }, [speciesFilter, mapRef, ready]);

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
