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
import { fetchForestAt, fetchSoilAt, fetchWaterDistanceAt, fetchTerrainAt } from "@mushroom-map/api-client";
import { useIsMobile } from "../lib/useIsMobile";
import { MapControls, BaseMapMode } from "./MapControls";
import { Legend } from "./Legend";
import { SearchBar } from "./SearchBar";

import { TILES_BASE } from "./mapView/utils/api";
import { buildPopupHtml, attachPopupHandlers } from "./mapView/utils/popup";
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
import { addWaterwayLayer, setWaterwayVisibility } from "./mapView/layers/waterway";
import { addHillshadeLayer, setHillshadeVisibility } from "./mapView/layers/hillshade";
import { addDistrictsLayer, setDistrictsVisibility } from "./mapView/layers/districts";
import {
  addForecastChoroplethLayer,
  applyForecastIndices,
  setForecastChoroplethVisibility,
  FORECAST_FILL_LAYER_ID,
} from "./mapView/layers/forecastChoropleth";
import { addPlaceLabelsLayer } from "./mapView/layers/places";
import { useLayerVisibility } from "../store/useLayerVisibility";
import { useForecastDate } from "../store/useForecastDate";
import { useForecastDistricts } from "../store/useForecastDistricts";
import { useMapMode } from "../store/useMapMode";
import {
  addUserSpotsLayer,
  removeUserSpotsLayer,
  updateUserSpots,
} from "./mapView/layers/userSpots";
import type { UserSpot } from "@mushroom-map/types";

const _protocol = new Protocol();
maplibregl.addProtocol("pmtiles", _protocol.tile.bind(_protocol));

interface MapViewProps {
  /** Список сохранённых юзером spot'ов; null = не залогинен / ещё не
   *  загружено. При смене массива — слой обновляется in-place
   *  (без recreate'а). */
  userSpots?: UserSpot[] | null;
}

export function MapView({ userSpots = null }: MapViewProps = {}) {
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
  const [waterwayVisible, setWaterwayVisible] = useState(true);
  const [waterwayLoaded, setWaterwayLoaded] = useState(false);
  const [hillshadeVisible, setHillshadeVisible] = useState(true);
  const [hillshadeLoaded, setHillshadeLoaded] = useState(false);
  const [districtsVisible, setDistrictsVisible] = useState(true);
  const [districtsLoaded, setDistrictsLoaded] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [vpnToast, setVpnToast] = useState<"hidden" | "visible" | "fading">("hidden");
  const vpnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [forestHint, setForestHint] = useState<"hidden" | "visible" | "fading">("hidden");
  const forestHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const waterwayVisibleRef = useRef(waterwayVisible);
  waterwayVisibleRef.current = waterwayVisible;
  const waterwayLoadedRef = useRef(false);
  const hillshadeVisibleRef = useRef(hillshadeVisible);
  hillshadeVisibleRef.current = hillshadeVisible;
  const hillshadeLoadedRef = useRef(false);
  const districtsVisibleRef = useRef(districtsVisible);
  districtsVisibleRef.current = districtsVisible;
  const districtsLoadedRef = useRef(false);
  // userSpots — единственный «динамический» слой: данные приходят из props
  // и могут поменяться в любой момент (создал/удалил spot). Ref нужен,
  // чтобы setupForestAndInteractions (после basemap-switch'а) знал
  // актуальный список без зависимости в callback'е.
  const userSpotsRef = useRef<UserSpot[] | null>(userSpots);
  userSpotsRef.current = userSpots;
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
      if (m.getLayer("roads-line"))   m.removeLayer("roads-line");
      if (m.getLayer("roads-casing")) m.removeLayer("roads-casing");
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
    if (waterwayLoadedRef.current) {
      if (m.getLayer("waterway-line")) m.removeLayer("waterway-line");
      if (m.getSource("waterway")) m.removeSource("waterway");
      addWaterwayLayer(m);
      setWaterwayVisibility(m, waterwayVisibleRef.current);
    }
    if (hillshadeLoadedRef.current) {
      if (m.getLayer("hillshade-raster")) m.removeLayer("hillshade-raster");
      if (m.getSource("hillshade")) m.removeSource("hillshade");
      addHillshadeLayer(m);
      setHillshadeVisibility(m, hillshadeVisibleRef.current);
    }
    if (districtsLoadedRef.current) {
      if (m.getLayer("districts-line")) m.removeLayer("districts-line");
      if (m.getLayer("forecast-choropleth-fill")) m.removeLayer("forecast-choropleth-fill");
      if (m.getSource("districts")) m.removeSource("districts");
      addDistrictsLayer(m);
      setDistrictsVisibility(m, districtsVisibleRef.current);
      // Forecast choropleth — фон-fill под линиями районов. Гэйтится
      // через useLayerVisibility, по умолчанию скрыт. Эффект ниже
      // следит за зустанд-стором и flip'ит visibility + feature-state.
      addForecastChoroplethLayer(m);

      // Click-into-district: тап по выкрашенному району переводит
      // useMapMode в режим 'district', что переключает Sidebar на
      // SidebarDistrict + (в будущем) поднимет flyTo. Используем
      // `useMapMode.getState()` потому что MapLibre-обработчики живут
      // вне React-tree (как и popup, см. fix C2 в спеке).
      m.on("click", FORECAST_FILL_LAYER_ID, (e) => {
        const feat = e.features?.[0];
        if (!feat || feat.id == null) return;
        const id = typeof feat.id === "number" ? feat.id : Number(feat.id);
        if (!Number.isFinite(id)) return;
        const props = (feat.properties ?? {}) as Record<string, unknown>;
        const osmRelId = props.osm_rel_id;
        const slug = osmRelId != null ? String(osmRelId) : String(id);
        useMapMode.getState().setDistrict(id, slug);
      });
      m.on("mouseenter", FORECAST_FILL_LAYER_ID, () => {
        m.getCanvas().style.cursor = "pointer";
      });
      m.on("mouseleave", FORECAST_FILL_LAYER_ID, () => {
        m.getCanvas().style.cursor = "";
      });
    }
    // User spots — приватный слой, появляется только когда юзер залогинен
    // и есть хоть одно место. После basemap switch'а нужно re-add'нуть
    // как остальные слои.
    const spots = userSpotsRef.current;
    if (m.getLayer("user-spots")) m.removeLayer("user-spots");
    if (m.getSource("user-spots-src")) m.removeSource("user-spots-src");
    if (spots && spots.length > 0) {
      addUserSpotsLayer(m, spots);
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
      if (forestHintTimerRef.current) clearTimeout(forestHintTimerRef.current);
      setForestHint("visible");
      forestHintTimerRef.current = setTimeout(() => setForestHint("fading"), 4000);
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
          const resp = await fetch(`${TILES_BASE}/${pmtilesName}`, { method: "HEAD" });
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

  const handleWaterwayToggle = useCallback(
    () => toggleLayerWithCheck(
      "waterway.pmtiles",
      "Данные водотоков не загружены — запустите ingest_waterway.py и build_waterway_tiles.py",
      waterwayLoadedRef, waterwayVisibleRef,
      setWaterwayLoaded, setWaterwayVisible,
      addWaterwayLayer, setWaterwayVisibility,
    ),
    [toggleLayerWithCheck],
  );

  const handleHillshadeToggle = useCallback(
    () => toggleLayerWithCheck(
      "hillshade.pmtiles",
      "Hillshade не собран — запустите scripts/download_copernicus_dem.py, build_terrain.py и build_hillshade_tiles.py",
      hillshadeLoadedRef, hillshadeVisibleRef,
      setHillshadeLoaded, setHillshadeVisible,
      addHillshadeLayer, setHillshadeVisibility,
    ),
    [toggleLayerWithCheck],
  );

  // Districts — GeoJSON из /api/districts, не PMTiles. HEAD-проверки не нужно:
  // если API доступен — данные загрузятся, если нет — MapLibre тихо покажет
  // пустой слой и в консоль упадёт ошибка fetch (приемлемо для optional слоя).
  const handleDistrictsToggle = useCallback(() => {
    const m = map.current;
    if (!m) return;
    if (!districtsLoadedRef.current) {
      districtsLoadedRef.current = true; setDistrictsLoaded(true);
      districtsVisibleRef.current = true; setDistrictsVisible(true);
      const doAdd = () => { addDistrictsLayer(m); setDistrictsVisibility(m, true); };
      if (m.isStyleLoaded()) doAdd();
      else m.once("idle", doAdd);
    } else {
      const next = !districtsVisibleRef.current;
      districtsVisibleRef.current = next; setDistrictsVisible(next);
      setDistrictsVisibility(m, next);
    }
  }, []);

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

  useEffect(() => {
    if (baseMap === "satellite" || baseMap === "hybrid") {
      if (vpnTimerRef.current) clearTimeout(vpnTimerRef.current);
      setVpnToast("visible");
      vpnTimerRef.current = setTimeout(() => setVpnToast("fading"), 3500);
    }
  }, [baseMap]);

  useEffect(() => {
    if (vpnToast === "fading") {
      const t = setTimeout(() => setVpnToast("hidden"), 800);
      return () => clearTimeout(t);
    }
  }, [vpnToast]);

  useEffect(() => {
    if (forestHint === "fading") {
      const t = setTimeout(() => setForestHint("hidden"), 800);
      return () => clearTimeout(t);
    }
  }, [forestHint]);

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

    // Общий click по карте — показываем попап везде (в т.ч. на почвах/воде/
    // болотах, где нет forest-полигона). forest/soil/water/terrain тянем
    // параллельно; buildPopupHtml сам разберётся что показывать.
    m.on("click", async (e) => {
      if (!e.lngLat) return;
      // Пропускаем клики по UI-контролам внутри карты.
      if ((e.originalEvent.target as HTMLElement | null)?.closest(".maplibregl-popup"))
        return;
      const { lng, lat } = e.lngLat;

      const popupMaxWidth = window.innerWidth < 600 ? `${window.innerWidth - 32}px` : "380px";
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
    });

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

  // Реагируем на смену userSpots prop — добавляем / обновляем / убираем
  // приватный слой. Карта может ещё не быть готова (style loading),
  // тогда откладываем до idle. Удаление при null или пустом массиве:
  // мы не показываем «один сиротливый» слой когда юзер вышел из аккаунта.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      const spots = userSpots;
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
  }, [userSpots]);

  // ─── Forecast choropleth controller ───────────────────────────────
  // Subscribes to the new zustand stores (Phase 2 path) without
  // disturbing the existing useState-driven layer wiring. Когда юзер
  // включает forecast в обзор-сайдбаре или попадает на overview-mode
  // главной — layer становится виден; на смене даты — feature-state
  // переписывается без re-fetch'а тайлов.
  const forecastChoroplethVisible = useLayerVisibility(
    (s) => s.visible.forecastChoropleth,
  );
  const forecastDate = useForecastDate((s) => s.selected);
  const { rows: forecastRows } = useForecastDistricts(forecastDate);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      // Если districts ещё не «загружены» (пользователь не дёргал чип
      // «Районы» в LayerGrid) — но forecastChoropleth просят показать
      // (это случается на /, MapHomePage эффект включает его сам), —
      // лениво поднимаем districts-layer. Это и добавит
      // `forecast-choropleth-fill` (см. addForecastChoroplethLayer
      // под basemap-switch handler'ом). Без этого вход на главную = пустая
      // карта без раскрашенных районов.
      if (forecastChoroplethVisible && !m.getLayer("forecast-choropleth-fill")) {
        if (!districtsLoadedRef.current) {
          districtsLoadedRef.current = true;
          setDistrictsLoaded(true);
          districtsVisibleRef.current = true;
          setDistrictsVisible(true);
          addDistrictsLayer(m);
          setDistrictsVisibility(m, true);
        }
        addForecastChoroplethLayer(m);
      }
      if (!m.getLayer("forecast-choropleth-fill")) return;
      setForecastChoroplethVisibility(m, forecastChoroplethVisible);
      if (forecastChoroplethVisible && forecastRows) {
        applyForecastIndices(m, forecastRows);
      }
    };
    if (m.isStyleLoaded()) apply();
    else m.once("idle", apply);
  }, [forecastChoroplethVisible, forecastRows]);

  // ─── Store → map controller (LayerGrid driving) ──────────────────
  // SidebarDistrict + LayerGrid пишут желаемое состояние слоёв в
  // useLayerVisibility. Эти эффекты сводят store к существующим
  // legacy-handler'ам (handleForestToggle, handleSoilToggle, ...) —
  // они умеют lazy-add и HEAD-проверку pmtiles.
  //
  // Дрейф с MapControls (legacy UI) принят как Phase 2 transitional:
  // LayerGrid переключает слой → MapControls-панель не обновляется,
  // но карта-источник правды совпадает со store. Полный refactor (один
  // источник правды) — в deferred-задаче «MapView decomposition».
  const storeForestVisible = useLayerVisibility((s) => s.visible.forest);
  const storeForestColorMode = useLayerVisibility((s) => s.forestColorMode);
  const storeSoilVisible = useLayerVisibility((s) => s.visible.soil);
  const storeHillshadeVisible = useLayerVisibility((s) => s.visible.hillshade);
  const storeUserSpotsVisible = useLayerVisibility((s) => s.visible.userSpots);

  useEffect(() => {
    if (storeForestVisible !== forestVisibleRef.current) {
      // legacy handler — toggle: если loaded → flip visibility;
      // если не loaded и storeVisible=true → lazy-add + show.
      if (forestLoadedRef.current || storeForestVisible) {
        handleForestToggle();
      }
    }
  }, [storeForestVisible, handleForestToggle]);

  useEffect(() => {
    if (storeForestColorMode !== forestColorMode) {
      handleForestColorMode(storeForestColorMode);
    }
  }, [storeForestColorMode, forestColorMode, handleForestColorMode]);

  useEffect(() => {
    if (storeSoilVisible !== soilVisibleRef.current) {
      if (soilLoadedRef.current || storeSoilVisible) {
        void handleSoilToggle();
      }
    }
  }, [storeSoilVisible, handleSoilToggle]);

  useEffect(() => {
    if (storeHillshadeVisible !== hillshadeVisibleRef.current) {
      if (hillshadeLoadedRef.current || storeHillshadeVisible) {
        void handleHillshadeToggle();
      }
    }
  }, [storeHillshadeVisible, handleHillshadeToggle]);

  useEffect(() => {
    const m = map.current;
    if (!m || !m.getLayer("user-spots")) return;
    m.setLayoutProperty(
      "user-spots",
      "visibility",
      storeUserSpotsVisible ? "visible" : "none",
    );
  }, [storeUserSpotsVisible]);

  // ─── flyTo on district select ────────────────────────────────────
  // Когда useMapMode переключился в 'district' — летим на bbox района.
  // Источник bbox — features из source 'districts' (тот же GeoJSON, что
  // питает choropleth и district lines). 1.2s easing — комфортная
  // длительность по spec'у.
  const selectedDistrictId = useMapMode((s) => s.districtId);
  useEffect(() => {
    const m = map.current;
    if (!m || selectedDistrictId == null) return;
    const fly = () => {
      const src = m.getSource("districts");
      if (!src || !("_data" in src) || !m.isSourceLoaded("districts")) {
        // Source not yet hydrated — schedule one retry on next idle.
        m.once("idle", fly);
        return;
      }
      // querySourceFeatures requires the layer to be there; districts-line
      // exists from addDistrictsLayer. Match feature by id.
      const feats = m.querySourceFeatures("districts", {
        sourceLayer: undefined,
      });
      const target = feats.find((f) => f.id === selectedDistrictId);
      if (!target || target.geometry.type !== "MultiPolygon"
          && target.geometry.type !== "Polygon") return;
      // Compute bbox manually (lightweight, avoids @turf/bbox).
      let minLng = Infinity, minLat = Infinity;
      let maxLng = -Infinity, maxLat = -Infinity;
      const visit = (rings: number[][][]) => {
        for (const ring of rings) {
          for (const [lng, lat] of ring) {
            if (lng < minLng) minLng = lng;
            if (lat < minLat) minLat = lat;
            if (lng > maxLng) maxLng = lng;
            if (lat > maxLat) maxLat = lat;
          }
        }
      };
      if (target.geometry.type === "Polygon") {
        visit(target.geometry.coordinates);
      } else {
        for (const poly of target.geometry.coordinates) visit(poly);
      }
      if (!isFinite(minLng) || !isFinite(maxLng)) return;
      m.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        { padding: 60, duration: 1200, maxZoom: 11 },
      );
    };
    fly();
  }, [selectedDistrictId]);

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
        waterwayVisible={waterwayVisible}
        waterwayLoaded={waterwayLoaded}
        onWaterwayToggle={handleWaterwayToggle}
        hillshadeVisible={hillshadeVisible}
        hillshadeLoaded={hillshadeLoaded}
        onHillshadeToggle={handleHillshadeToggle}
        districtsVisible={districtsVisible}
        districtsLoaded={districtsLoaded}
        onDistrictsToggle={handleDistrictsToggle}
        onShare={handleShare}
      />

      <SearchBar onFlyTo={handleFlyTo} onSpeciesFilter={handleSpeciesFilter} />

      {(forestLoaded || (soilLoaded && soilVisible)) && (
        <Legend
          mode={soilLoaded && soilVisible ? "soil" : "forest"}
          colorMode={forestColorMode}
        />
      )}

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
