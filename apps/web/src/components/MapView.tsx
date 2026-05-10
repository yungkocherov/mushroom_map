import { useCallback, useEffect, useMemo, useRef } from "react";

import { useIsMobile } from "../lib/useIsMobile";
import { Legend } from "./Legend";

import { addPlaceLabelsLayer } from "./mapView/layers/places";
import { addUserSpotsLayer } from "./mapView/layers/userSpots";
import { useMapLayers } from "./mapView/hooks/useMapLayers";
import { useMapInstance, parseInitialView } from "./mapView/hooks/useMapInstance";
import { useMapPopup } from "./mapView/hooks/useMapPopup";
import { useMapUrl } from "./mapView/hooks/useMapUrl";
import { useUserSpotsSync } from "./mapView/hooks/useUserSpotsSync";
import { useBaseMap } from "./mapView/hooks/useBaseMap";
import { useToastLifecycles } from "./mapView/hooks/useToastLifecycles";
import { LayerGrid } from "./mapView/LayerGrid";
import { MapOverlays } from "./mapView/MapOverlays";
import { CursorReadout } from "./mapView/CursorReadout";
import { SpeciesFilterBadge } from "./mapView/SpeciesFilterBadge";
import { ForestLoadingOverlay } from "./mapView/ForestLoadingOverlay";

import { type BaseMapMode } from "../store/useLayerVisibility";
import type { UserSpot } from "@mushroom-map/types";

interface MapViewProps {
  /** Список сохранённых юзером spot'ов; null = не залогинен / ещё не
   *  загружено. При смене массива — слой обновляется in-place
   *  (без recreate'а). */
  userSpots?: UserSpot[] | null;
}

export function MapView({ userSpots = null }: MapViewProps = {}) {
  const mobile = useIsMobile();
  const mapRef = useRef<HTMLDivElement>(null);
  const userSpotsRef = useRef<UserSpot[] | null>(userSpots);
  userSpotsRef.current = userSpots;

  // ─── Store subscriptions ──────────────────────────────────────────
  // SearchBar removed in Phase W4 — поиск теперь живёт в MapTopBar
  // через Spotlight (⌘K). setSpeciesFilter из URL-парам ?species=
  // продолжает работать через MapHomePage.

  const initialView = useMemo(() => parseInitialView(), []);
  const { map, ready: mapReady } = useMapInstance(mapRef, initialView, (m) => {
    if (m.getLayer("places-text")) m.removeLayer("places-text");
    if (m.getSource("places")) m.removeSource("places");
    addPlaceLabelsLayer(m);
    const spots = userSpotsRef.current;
    if (spots && spots.length > 0) addUserSpotsLayer(m, spots);
  });

  const { reapplyAll } = useMapLayers(map, mapReady);
  useMapPopup(map);
  useMapUrl(map);

  // ─── Basemap switch ───────────────────────────────────────────────
  // После setStyle: places — только для scheme/hybrid (satellite/osm имеют
  // свои labels или не нужны); userSpots — pересоздаём из ref'а;
  // registry-слои — через reapplyAll().
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
  }, [reapplyAll, map]);
  useBaseMap(map, handleStyleApplied);

  useUserSpotsSync(map, userSpots);
  useToastLifecycles();

  // `mm:fly-to` event from Spotlight — летим на выбранный топоним.
  // Slowdown via `essential: true` чтобы prefers-reduced-motion не
  // прерывал navigation.
  useEffect(() => {
    const onFly = (e: Event) => {
      const ce = e as CustomEvent<{ lat: number; lon: number; zoom?: number }>;
      const m = map.current;
      if (!m || !ce.detail) return;
      const { lat, lon, zoom = 11 } = ce.detail;
      m.flyTo({ center: [lon, lat], zoom, speed: 1.5, essential: true });
    };
    window.addEventListener("mm:fly-to", onFly as EventListener);
    return () => window.removeEventListener("mm:fly-to", onFly as EventListener);
  }, [map]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={mapRef} className="map-root" />

      <LayerGrid layout={mobile ? "strip" : "grid"} floating showFooter showBasemap mapRef={map} />

      <Legend />
      <CursorReadout mapRef={map} />
      <ForestLoadingOverlay mapRef={map} />
      <MapOverlays />
      <SpeciesFilterBadge />
    </div>
  );
}
