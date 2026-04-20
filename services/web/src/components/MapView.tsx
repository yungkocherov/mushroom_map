import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl, { Map } from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";

import {
  FOREST_LAYER_PAINT_COLOR,
  FOREST_LAYER_PAINT_BONITET,
  FOREST_LAYER_PAINT_AGE_GROUP,
  ForestColorMode,
} from "../lib/forestStyle";
import { fetchForestAt, fetchSoilAt } from "../lib/api";
import { useIsMobile } from "../lib/useIsMobile";
import { MapControls, BaseMapMode } from "./MapControls";
import { Legend } from "./Legend";
import { SearchBar } from "./SearchBar";

import { API_ORIGIN } from "./mapView/utils/api";
import { buildPopupHtml } from "./mapView/utils/popup";
import { INLINE_STYLE, SATELLITE_STYLE } from "./mapView/styles/inline";
import { buildSchemeStyle, SCHEME_STYLE_FALLBACK } from "./mapView/styles/scheme";
import { buildHybridStyle, HYBRID_STYLE_FALLBACK } from "./mapView/styles/hybrid";
import { addForestLayer, setForestVisibility } from "./mapView/layers/forest";
import { addOoptLayer, setOoptVisibility } from "./mapView/layers/oopt";
import { addRoadsLayer, setRoadsVisibility } from "./mapView/layers/roads";
import { addWaterLayer, setWaterVisibility } from "./mapView/layers/water";
import { addWetlandLayer, setWetlandVisibility } from "./mapView/layers/wetland";
import { addFellingLayer, setFellingVisibility } from "./mapView/layers/felling";
import { addProtectiveLayer, setProtectiveVisibility } from "./mapView/layers/protective";
import { addSoilLayer, setSoilVisibility } from "./mapView/layers/soil";
import { addPlaceLabelsLayer } from "./mapView/layers/places";

const _protocol = new Protocol();
maplibregl.addProtocol("pmtiles", _protocol.tile.bind(_protocol));

export function MapView() {
  const mobile = useIsMobile();
  const mapRef = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const [baseMap, setBaseMap] = useState<BaseMapMode>("scheme");
  const [forestVisible, setForestVisible] = useState(true);
  const [forestLoaded, setForestLoaded] = useState(false);
  const [forestColorMode, setForestColorMode] = useState<ForestColorMode>("species");
  const [cursor, setCursor] = useState<{ lat: number; lon: number } | null>(null);
  const [shareToast, setShareToast] = useState(false);
  const [speciesFilterLabel, setSpeciesFilterLabel] = useState<string | null>(null);
  const [waterVisible, setWaterVisible] = useState(true);
  const [waterLoaded, setWaterLoaded] = useState(false);
  const [ooptVisible, setOoptVisible] = useState(true);
  const [ooptLoaded, setOoptLoaded] = useState(false);
  const [roadsVisible, setRoadsVisible] = useState(true);
  const [roadsLoaded, setRoadsLoaded] = useState(false);
  const [wetlandVisible, setWetlandVisible] = useState(true);
  const [wetlandLoaded, setWetlandLoaded] = useState(false);
  const [fellingVisible, setFellingVisible] = useState(true);
  const [fellingLoaded, setFellingLoaded] = useState(false);
  const [protectiveVisible, setProtectiveVisible] = useState(true);
  const [protectiveLoaded, setProtectiveLoaded] = useState(false);
  const [soilVisible, setSoilVisible] = useState(true);
  const [soilLoaded, setSoilLoaded] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const forestVisibleRef = useRef(forestVisible);
  forestVisibleRef.current = forestVisible;
  const forestLoadedRef = useRef(false);
  const waterVisibleRef = useRef(waterVisible);
  waterVisibleRef.current = waterVisible;
  const waterLoadedRef = useRef(false);
  const ooptVisibleRef = useRef(ooptVisible);
  ooptVisibleRef.current = ooptVisible;
  const ooptLoadedRef = useRef(false);
  const roadsVisibleRef = useRef(roadsVisible);
  roadsVisibleRef.current = roadsVisible;
  const roadsLoadedRef = useRef(false);
  const wetlandVisibleRef = useRef(wetlandVisible);
  wetlandVisibleRef.current = wetlandVisible;
  const wetlandLoadedRef = useRef(false);
  const fellingVisibleRef = useRef(fellingVisible);
  fellingVisibleRef.current = fellingVisible;
  const fellingLoadedRef = useRef(false);
  const protectiveVisibleRef = useRef(protectiveVisible);
  protectiveVisibleRef.current = protectiveVisible;
  const protectiveLoadedRef = useRef(false);
  const soilVisibleRef = useRef(soilVisible);
  soilVisibleRef.current = soilVisible;
  const soilLoadedRef = useRef(false);
  // Изначально INLINE_STYLE (osm), useState инициализирован "scheme" → первый
  // useEffect переключит с osm на scheme.
  const appliedBaseMap = useRef<BaseMapMode>("osm");

  // setStyle с diff=true может оставить source живым, но снести layer →
  // addLayer делает early-return и слой пропадает. Принудительно сносим
  // и source, и layer перед re-add.
  const setupForestAndInteractions = useCallback((m: Map) => {
    if (m.getLayer("places-text")) m.removeLayer("places-text");
    if (m.getSource("places"))    m.removeSource("places");
    if (appliedBaseMap.current === "scheme" || appliedBaseMap.current === "hybrid") {
      addPlaceLabelsLayer(m);
    }

    if (forestLoadedRef.current) {
      if (m.getLayer("forest-fill")) m.removeLayer("forest-fill");
      if (m.getSource("forest")) m.removeSource("forest");
      addForestLayer(m);
      setForestVisibility(m, forestVisibleRef.current);
    }
    if (waterLoadedRef.current) {
      if (m.getLayer("water-fill")) m.removeLayer("water-fill");
      if (m.getSource("water")) m.removeSource("water");
      addWaterLayer(m);
      setWaterVisibility(m, waterVisibleRef.current);
    }
    if (ooptLoadedRef.current) {
      if (m.getLayer("oopt-fill")) m.removeLayer("oopt-fill");
      if (m.getSource("oopt")) m.removeSource("oopt");
      addOoptLayer(m);
      setOoptVisibility(m, ooptVisibleRef.current);
    }
    if (roadsLoadedRef.current) {
      if (m.getLayer("roads-line")) m.removeLayer("roads-line");
      if (m.getSource("roads")) m.removeSource("roads");
      addRoadsLayer(m);
      setRoadsVisibility(m, roadsVisibleRef.current);
    }
    if (wetlandLoadedRef.current) {
      if (m.getLayer("wetland-fill")) m.removeLayer("wetland-fill");
      if (m.getSource("wetland")) m.removeSource("wetland");
      addWetlandLayer(m);
      setWetlandVisibility(m, wetlandVisibleRef.current);
    }
    if (fellingLoadedRef.current) {
      if (m.getLayer("felling-fill")) m.removeLayer("felling-fill");
      if (m.getSource("felling")) m.removeSource("felling");
      addFellingLayer(m);
      setFellingVisibility(m, fellingVisibleRef.current);
    }
    if (protectiveLoadedRef.current) {
      if (m.getLayer("protective-fill")) m.removeLayer("protective-fill");
      if (m.getSource("protective")) m.removeSource("protective");
      addProtectiveLayer(m);
      setProtectiveVisibility(m, protectiveVisibleRef.current);
    }
    if (soilLoadedRef.current) {
      if (m.getLayer("soil-fill")) m.removeLayer("soil-fill");
      if (m.getSource("soil")) m.removeSource("soil");
      addSoilLayer(m);
      setSoilVisibility(m, soilVisibleRef.current);
    }
  }, []);

  // Если стиль ещё переключается (buildHybridStyle в полёте) — откладываем
  // addLayer до события idle, иначе MapLibre сотрёт наш layer при setStyle.
  const handleForestToggle = useCallback(() => {
    const m = map.current;
    if (!m) return;
    if (!forestLoadedRef.current) {
      forestLoadedRef.current = true;
      setForestLoaded(true);
      forestVisibleRef.current = true;
      setForestVisible(true);
      const doAdd = () => {
        addForestLayer(m);
        setForestVisibility(m, true);
      };
      if (m.isStyleLoaded()) doAdd();
      else m.once("idle", doAdd);
    } else {
      const next = !forestVisibleRef.current;
      forestVisibleRef.current = next;
      setForestVisible(next);
      setForestVisibility(m, next);
    }
  }, []);

  const handleWaterToggle = useCallback(() => {
    const m = map.current;
    if (!m) return;
    if (!waterLoadedRef.current) {
      waterLoadedRef.current = true; setWaterLoaded(true);
      waterVisibleRef.current = true; setWaterVisible(true);
      const doAdd = () => { addWaterLayer(m); setWaterVisibility(m, true); };
      if (m.isStyleLoaded()) doAdd();
      else m.once("idle", doAdd);
    } else {
      const next = !waterVisibleRef.current;
      waterVisibleRef.current = next; setWaterVisible(next);
      setWaterVisibility(m, next);
    }
  }, []);

  // Generic toggle с HEAD-проверкой pmtiles-файла.
  const toggleLayerWithCheck = useCallback(
    async (
      pmtilesName: string,
      notFoundMsg: string,
      loadedRef: React.MutableRefObject<boolean>,
      visibleRef: React.MutableRefObject<boolean>,
      setLoaded: (v: boolean) => void,
      setVisible: (v: boolean) => void,
      addLayer: (m: Map) => void,
      setVisibility: (m: Map, v: boolean) => void,
    ) => {
      const m = map.current;
      if (!m) return;
      if (!loadedRef.current) {
        try {
          const resp = await fetch(`${API_ORIGIN}/tiles/${pmtilesName}`, { method: "HEAD" });
          if (!resp.ok) {
            setErrorMsg(notFoundMsg);
            setTimeout(() => setErrorMsg(null), 5000);
            return;
          }
        } catch {
          setErrorMsg(`Не удалось проверить ${pmtilesName}`);
          setTimeout(() => setErrorMsg(null), 4000);
          return;
        }
        loadedRef.current = true; setLoaded(true);
        visibleRef.current = true; setVisible(true);
        const doAdd = () => { addLayer(m); setVisibility(m, true); };
        if (m.isStyleLoaded()) doAdd();
        else m.once("idle", doAdd);
      } else {
        const next = !visibleRef.current;
        visibleRef.current = next; setVisible(next);
        setVisibility(m, next);
      }
    },
    [],
  );

  const handleOoptToggle = useCallback(
    () => toggleLayerWithCheck(
      "oopt.pmtiles",
      "Данные ООПТ не загружены — запустите ingest_oopt.py и build_oopt_tiles.py",
      ooptLoadedRef, ooptVisibleRef,
      setOoptLoaded, setOoptVisible,
      addOoptLayer, setOoptVisibility,
    ),
    [toggleLayerWithCheck],
  );

  const handleRoadsToggle = useCallback(
    () => toggleLayerWithCheck(
      "roads.pmtiles",
      "Данные дорог не загружены — запустите ingest_osm_roads.py и build_roads_tiles.py",
      roadsLoadedRef, roadsVisibleRef,
      setRoadsLoaded, setRoadsVisible,
      addRoadsLayer, setRoadsVisibility,
    ),
    [toggleLayerWithCheck],
  );

  const handleWetlandToggle = useCallback(
    () => toggleLayerWithCheck(
      "wetlands.pmtiles",
      "Данные болот не загружены — запустите ingest_wetlands.py и build_wetlands_tiles.py",
      wetlandLoadedRef, wetlandVisibleRef,
      setWetlandLoaded, setWetlandVisible,
      addWetlandLayer, setWetlandVisibility,
    ),
    [toggleLayerWithCheck],
  );

  const handleFellingToggle = useCallback(
    () => toggleLayerWithCheck(
      "felling.pmtiles",
      "Данные вырубок не загружены — запустите ingest_felling.py и build_felling_tiles.py",
      fellingLoadedRef, fellingVisibleRef,
      setFellingLoaded, setFellingVisible,
      addFellingLayer, setFellingVisibility,
    ),
    [toggleLayerWithCheck],
  );

  const handleProtectiveToggle = useCallback(
    () => toggleLayerWithCheck(
      "protective.pmtiles",
      "Данные защитных лесов не загружены — запустите ingest_protective.py и build_protective_tiles.py",
      protectiveLoadedRef, protectiveVisibleRef,
      setProtectiveLoaded, setProtectiveVisible,
      addProtectiveLayer, setProtectiveVisibility,
    ),
    [toggleLayerWithCheck],
  );

  const handleSoilToggle = useCallback(
    () => toggleLayerWithCheck(
      "soil.pmtiles",
      "Данные почв не загружены — запустите ingest_soil.py и build_soil_tiles.py",
      soilLoadedRef, soilVisibleRef,
      setSoilLoaded, setSoilVisible,
      addSoilLayer, setSoilVisibility,
    ),
    [toggleLayerWithCheck],
  );

  const handleForestColorMode = useCallback((mode: ForestColorMode) => {
    setForestColorMode(mode);
    const m = map.current;
    if (!m || !m.getLayer("forest-fill")) return;
    const paint =
      mode === "bonitet"   ? FOREST_LAYER_PAINT_BONITET["fill-color"] :
      mode === "age_group" ? FOREST_LAYER_PAINT_AGE_GROUP["fill-color"] :
      FOREST_LAYER_PAINT_COLOR["fill-color"];
    m.setPaintProperty("forest-fill", "fill-color", paint);
  }, []);

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
  }, []);

  const handleFlyTo = useCallback((lat: number, lon: number, zoom = 13) => {
    map.current?.flyTo({ center: [lon, lat], zoom, speed: 1.5 });
  }, []);

  const handleSpeciesFilter = useCallback((forestTypes: string[] | null, label: string | null) => {
    const m = map.current;
    setSpeciesFilterLabel(label);
    if (!m || !m.getLayer("forest-fill")) return;
    if (!forestTypes || forestTypes.length === 0) {
      m.setFilter("forest-fill", null);
    } else {
      m.setFilter("forest-fill", ["in", ["get", "dominant_species"], ["literal", forestTypes]]);
    }
  }, []);

  useEffect(() => {
    if (!mapRef.current || map.current) return;

    const urlParams = new URLSearchParams(window.location.search);
    const initLat = parseFloat(urlParams.get("lat") ?? "60.0");
    const initLon = parseFloat(urlParams.get("lon") ?? "30.5");
    const initZ   = parseFloat(urlParams.get("z")   ?? "8");

    map.current = new maplibregl.Map({
      container: mapRef.current,
      style: INLINE_STYLE,
      center: [isFinite(initLon) ? initLon : 30.5, isFinite(initLat) ? initLat : 60.0],
      zoom: isFinite(initZ) ? initZ : 8,
    });

    const m = map.current;

    // НЕ ждём load (он ждёт тайлы — если CDN завис, load никогда не стреляет).
    // styledata может выстрелить ДО того как стиль применён, поэтому
    // проверяем isStyleLoaded() в каждом вызове.
    const onStyleReady = () => {
      if (m.isStyleLoaded()) {
        m.off("styledata", onStyleReady);
        setupForestAndInteractions(m);
      }
    };
    m.on("styledata", onStyleReady);

    m.addControl(new maplibregl.NavigationControl(), "top-right");
    m.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );

    m.on("mousemove", (e) => setCursor({ lat: e.lngLat.lat, lon: e.lngLat.lng }));

    const syncUrl = () => {
      const { lat, lng } = m.getCenter();
      const z = Math.round(m.getZoom() * 10) / 10;
      const url = new URL(window.location.href);
      url.searchParams.set("lat", lat.toFixed(5));
      url.searchParams.set("lon", lng.toFixed(5));
      url.searchParams.set("z", String(z));
      history.replaceState(null, "", url.toString());
    };
    m.on("moveend", syncUrl);

    m.on("click", "forest-fill", async (e) => {
      if (!e.lngLat) return;
      const { lng, lat } = e.lngLat;

      // На мобильном popup занимает ширину экрана минус по 16px с каждой стороны
      const popupMaxWidth = window.innerWidth < 600 ? `${window.innerWidth - 32}px` : "380px";
      const popup = new maplibregl.Popup({ maxWidth: popupMaxWidth })
        .setLngLat([lng, lat])
        .setHTML(`<div style="font-family:sans-serif;color:#555;padding:4px">Загружаю…</div>`)
        .addTo(m);

      try {
        const [forest, soil] = await Promise.all([
          fetchForestAt(lat, lng),
          fetchSoilAt(lat, lng).catch(() => null),
        ]);
        popup.setHTML(buildPopupHtml(forest, soil));
      } catch {
        popup.setHTML(`<div style="color:#c62828;font-size:12px">Ошибка загрузки данных</div>`);
      }
    });

    m.on("mouseenter", "forest-fill", () => { m.getCanvas().style.cursor = "pointer"; });
    m.on("mouseleave", "forest-fill", () => { m.getCanvas().style.cursor = ""; });
    m.on("mouseenter", "water-fill", () => { m.getCanvas().style.cursor = "pointer"; });
    m.on("mouseleave", "water-fill", () => { m.getCanvas().style.cursor = ""; });

    return () => {
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Смена базовой подложки. Исторически были два бага:
  // 1) `appliedBaseMap.current = baseMap` ставилось В НАЧАЛЕ effect'а → в
  //    React StrictMode при double-invocation второй раз ref уже совпадал
  //    с baseMap и effect возвращался раньше, реальный setStyle не вызывался.
  // 2) styledata + isStyleLoaded() иногда промахивается: первый styledata firing
  //    с isStyleLoaded=false, второй не приходит (внешняя загрузка зависла) →
  //    оверлеи не восстанавливаются.
  // Фикс: RAF-polling вместо styledata listener'а; appliedBaseMap пишем
  // ПОСЛЕ успешного setStyle.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (appliedBaseMap.current === baseMap) return;

    let cancelled = false;

    const apply = (style: maplibregl.StyleSpecification) => {
      if (cancelled) return;
      // diff: false — полная замена. С тяжёлыми стилями (Versatiles 60+ слоёв
      // + патчи sprite/text-size) diff приводит к артефактам: часть тайлов
      // рендерится старым стилем, часть новым.
      m.setStyle(style, { diff: false });
      appliedBaseMap.current = baseMap;

      const poll = () => {
        if (cancelled) return;
        if (m.isStyleLoaded()) {
          setupForestAndInteractions(m);
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
  }, [baseMap, setupForestAndInteractions]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={mapRef} className="map-root" />

      <MapControls
        baseMap={baseMap}
        onBaseMapChange={setBaseMap}
        forestVisible={forestVisible}
        forestLoaded={forestLoaded}
        onForestToggle={handleForestToggle}
        forestColorMode={forestColorMode}
        onForestColorMode={handleForestColorMode}
        waterVisible={waterVisible}
        waterLoaded={waterLoaded}
        onWaterToggle={handleWaterToggle}
        ooptVisible={ooptVisible}
        ooptLoaded={ooptLoaded}
        onOoptToggle={handleOoptToggle}
        roadsVisible={roadsVisible}
        roadsLoaded={roadsLoaded}
        onRoadsToggle={handleRoadsToggle}
        wetlandVisible={wetlandVisible}
        wetlandLoaded={wetlandLoaded}
        onWetlandToggle={handleWetlandToggle}
        fellingVisible={fellingVisible}
        fellingLoaded={fellingLoaded}
        onFellingToggle={handleFellingToggle}
        protectiveVisible={protectiveVisible}
        protectiveLoaded={protectiveLoaded}
        onProtectiveToggle={handleProtectiveToggle}
        soilVisible={soilVisible}
        soilLoaded={soilLoaded}
        onSoilToggle={handleSoilToggle}
        onShare={handleShare}
      />

      <SearchBar onFlyTo={handleFlyTo} onSpeciesFilter={handleSpeciesFilter} />

      {forestLoaded && <Legend colorMode={forestColorMode} />}

      {/* Координаты под курсором — скрыты на тач-устройствах */}
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
