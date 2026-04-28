import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";

import { useIsMobile } from "../lib/useIsMobile";
import { MapControls } from "./MapControls";
import { Legend } from "./Legend";
import { SearchBar } from "./SearchBar";

import { INLINE_STYLE, SATELLITE_STYLE } from "./mapView/styles/inline";
import { buildSchemeStyle, SCHEME_STYLE_FALLBACK } from "./mapView/styles/scheme";
import { buildHybridStyle, HYBRID_STYLE_FALLBACK } from "./mapView/styles/hybrid";
import { addPlaceLabelsLayer } from "./mapView/layers/places";
import { addUserSpotsLayer } from "./mapView/layers/userSpots";
import { useMapLayers } from "./mapView/hooks/useMapLayers";
import { useMapInstance, parseInitialView } from "./mapView/hooks/useMapInstance";
import { useMapPopup } from "./mapView/hooks/useMapPopup";
import { useMapUrl } from "./mapView/hooks/useMapUrl";
import { useUserSpotsSync } from "./mapView/hooks/useUserSpotsSync";

import {
  useLayerVisibility,
  type BaseMapMode,
} from "../store/useLayerVisibility";
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
  const [cursor, setCursor] = useState<{ lat: number; lon: number } | null>(null);
  const userSpotsRef = useRef<UserSpot[] | null>(userSpots);
  userSpotsRef.current = userSpots;
  // Map создаётся с INLINE_STYLE (osm). Store по умолчанию "scheme" →
  // первый run basemap-switch effect'а сделает реальный setStyle.
  const appliedBaseMap = useRef<BaseMapMode>("osm");

  // ─── Store subscriptions ──────────────────────────────────────────
  const baseMap = useLayerVisibility((s) => s.baseMap);
  const setBaseMap = useLayerVisibility((s) => s.setBaseMap);
  const visible = useLayerVisibility((s) => s.visible);
  const loaded = useLayerVisibility((s) => s.loaded);
  const toggleVisible = useLayerVisibility((s) => s.toggleVisible);
  const forestColorMode = useLayerVisibility((s) => s.forestColorMode);
  const setForestColorMode = useLayerVisibility((s) => s.setForestColorMode);
  const setSpeciesFilter = useLayerVisibility((s) => s.setSpeciesFilter);
  const errorMsg = useLayerVisibility((s) => s.errorMsg);
  const vpnToast = useLayerVisibility((s) => s.vpnToast);
  const setVpnToast = useLayerVisibility((s) => s.setVpnToast);
  const forestHint = useLayerVisibility((s) => s.forestHint);
  const setForestHint = useLayerVisibility((s) => s.setForestHint);
  const shareToast = useLayerVisibility((s) => s.shareToast);
  const setShareToast = useLayerVisibility((s) => s.setShareToast);
  const speciesFilterLabel = useLayerVisibility((s) => s.speciesFilterLabel);

  const initialView = useMemo(() => parseInitialView(), []);
  const map = useMapInstance(mapRef, initialView, (m) => {
    if (m.getLayer("places-text")) m.removeLayer("places-text");
    if (m.getSource("places")) m.removeSource("places");
    addPlaceLabelsLayer(m);
    const spots = userSpotsRef.current;
    if (spots && spots.length > 0) addUserSpotsLayer(m, spots);
  });

  const { reapplyAll } = useMapLayers(map);
  useMapPopup(map);
  useMapUrl(map);

  // ─── Cursor tracking ─────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const onMouseMove = (e: maplibregl.MapMouseEvent) =>
      setCursor({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    m.on("mousemove", onMouseMove);

    return () => {
      m.off("mousemove", onMouseMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Basemap switch ───────────────────────────────────────────────
  // Исторически были два бага:
  // 1) `appliedBaseMap.current = baseMap` ставилось В НАЧАЛЕ effect'а → в
  //    React StrictMode при double-invocation второй раз ref уже совпадал
  //    с baseMap и effect возвращался раньше, реальный setStyle не вызывался.
  // 2) styledata + isStyleLoaded() иногда промахивается: первый styledata firing
  //    с isStyleLoaded=false, второй не приходит (внешняя загрузка зависла) →
  //    оверлеи не восстанавливаются.
  // Фикс: RAF-polling вместо styledata listener'а; appliedBaseMap пишем
  // ПОСЛЕ успешного setStyle. Re-add layers через reapplyAll() из useMapLayers.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (appliedBaseMap.current === baseMap) return;

    let cancelled = false;

    const apply = (style: maplibregl.StyleSpecification) => {
      if (cancelled) return;
      // diff: false — полная замена. С тяжёлыми стилями (Versatiles 60+ слоёв
      // + патчи sprite/text-size) diff приводит к артефактам.
      m.setStyle(style, { diff: false });
      appliedBaseMap.current = baseMap;

      const poll = () => {
        if (cancelled) return;
        if (m.isStyleLoaded()) {
          // Places: пересоздаём только для scheme/hybrid (на satellite/osm
          // labels уже идут из basemap'а либо нам не нужны).
          if (m.getLayer("places-text")) m.removeLayer("places-text");
          if (m.getSource("places")) m.removeSource("places");
          if (baseMap === "scheme" || baseMap === "hybrid") {
            addPlaceLabelsLayer(m);
          }
          // userSpots: setStyle убил layer + source — пересоздаём из ref'а.
          if (m.getLayer("user-spots")) m.removeLayer("user-spots");
          if (m.getSource("user-spots-src")) m.removeSource("user-spots-src");
          const spots = userSpotsRef.current;
          if (spots && spots.length > 0) addUserSpotsLayer(m, spots);
          // Все registry-слои — через единый callback.
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

  useUserSpotsSync(map, userSpots);

  // ─── VPN toast on satellite/hybrid switch ─────────────────────────
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

  // ─── Forest hint fade ─────────────────────────────────────────────
  useEffect(() => {
    if (forestHint === "fading") {
      const t = setTimeout(() => setForestHint("hidden"), 800);
      return () => clearTimeout(t);
    }
  }, [forestHint, setForestHint]);

  // Срабатывает один раз когда forest впервые становится loaded.
  const forestPrevLoadedRef = useRef(false);
  useEffect(() => {
    if (loaded.forest && !forestPrevLoadedRef.current) {
      forestPrevLoadedRef.current = true;
      setForestHint("visible");
      const t = setTimeout(() => setForestHint("fading"), 4000);
      return () => clearTimeout(t);
    }
  }, [loaded.forest, setForestHint]);

  // ─── Share + species filter callbacks ─────────────────────────────
  const handleShare = useCallback(() => {
    const m = map.current;
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
  }, [setShareToast]);

  const handleFlyTo = useCallback((lat: number, lon: number, zoom = 13) => {
    map.current?.flyTo({ center: [lon, lat], zoom, speed: 1.5 });
  }, []);

  const handleSpeciesFilter = useCallback(
    (forestTypes: string[] | null, label: string | null) => {
      setSpeciesFilter(forestTypes, label);
    },
    [setSpeciesFilter],
  );

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={mapRef} className="map-root" />

      <MapControls
        baseMap={baseMap}
        onBaseMapChange={setBaseMap}
        forestVisible={visible.forest}
        forestLoaded={loaded.forest}
        onForestToggle={() => toggleVisible("forest")}
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

      <SearchBar onFlyTo={handleFlyTo} onSpeciesFilter={handleSpeciesFilter} />

      {(loaded.forest || (loaded.soil && visible.soil)) && (
        <Legend
          mode={loaded.soil && visible.soil ? "soil" : "forest"}
          colorMode={forestColorMode}
        />
      )}

      {cursor && !mobile && (
        <div style={{
          position: "absolute", bottom: 28, right: 50,
          background: "rgba(255,255,255,0.85)", borderRadius: 4,
          padding: "2px 7px", fontSize: 11, color: "#555",
          fontFamily: "monospace", zIndex: 10,
          pointerEvents: "none",
        }}>
          {cursor.lat.toFixed(5)}, {cursor.lon.toFixed(5)}
        </div>
      )}

      {shareToast && (
        <div style={{
          position: "absolute", bottom: 50, left: "50%", transform: "translateX(-50%)",
          background: "#323232", color: "white", borderRadius: 6,
          padding: "8px 16px", fontSize: 13, zIndex: 30,
          fontFamily: "system-ui, sans-serif",
        }}>
          Ссылка скопирована
        </div>
      )}

      {errorMsg && (
        <div style={{
          position: "absolute", bottom: 50, left: "50%", transform: "translateX(-50%)",
          background: "#c62828", color: "white", borderRadius: 6,
          padding: "8px 16px", fontSize: 12, zIndex: 30, maxWidth: 380, textAlign: "center",
          fontFamily: "system-ui, sans-serif",
        }}>
          {errorMsg}
        </div>
      )}

      {forestHint !== "hidden" && (
        <div style={{
          position: "absolute",
          bottom: mobile ? 60 : 50,
          left: "50%",
          transform: "translateX(-50%)",
          background: "#2e7d32",
          color: "white",
          borderRadius: 8,
          padding: "14px 22px",
          fontSize: mobile ? 15 : 17,
          fontFamily: "system-ui, sans-serif",
          zIndex: 30,
          maxWidth: "calc(100vw - 32px)",
          textAlign: "center",
          boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
          opacity: forestHint === "fading" ? 0 : 1,
          transition: forestHint === "fading" ? "opacity 0.8s ease" : "none",
          pointerEvents: "none",
        }}>
          Нажмите на любую точку карты, чтобы увидеть подробную информацию
        </div>
      )}

      {vpnToast !== "hidden" && (
        <div style={{
          position: "absolute",
          top: mobile ? 90 : 52,
          left: "50%",
          transform: "translateX(-50%)",
          background: "white",
          color: "#333",
          borderRadius: 8,
          padding: "14px 22px",
          fontSize: mobile ? 16 : 18,
          fontFamily: "system-ui, sans-serif",
          zIndex: 30,
          maxWidth: "calc(100vw - 32px)",
          textAlign: "center",
          boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
          border: "1px solid rgba(0,0,0,0.08)",
          opacity: vpnToast === "fading" ? 0 : 1,
          transition: vpnToast === "fading" ? "opacity 0.8s ease" : "none",
          pointerEvents: "none",
        }}>
          ℹ️ Спутниковые снимки могут не загружаться при активном VPN-соединении
        </div>
      )}

      {speciesFilterLabel && (
        <div style={{
          position: "absolute", top: 56, left: "50%", transform: "translateX(-50%)",
          background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 6,
          padding: "5px 12px", fontSize: 12, color: "#2e7d32",
          fontFamily: "system-ui, sans-serif", zIndex: 15,
        }}>
          Показаны леса для: <strong>{speciesFilterLabel}</strong>
        </div>
      )}
    </div>
  );
}
