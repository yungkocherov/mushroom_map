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
import { fetchForestAt, ForestAtResponse } from "../lib/api";
import { MapControls, BaseMapMode } from "./MapControls";
import { Legend } from "./Legend";
import { SearchBar } from "./SearchBar";

// ─── PMTiles protocol ─────────────────────────────────────────────────────────
const _protocol = new Protocol();
maplibregl.addProtocol("pmtiles", _protocol.tile.bind(_protocol));

// В dev PMTiles идёт напрямую к API (Vite proxy не поддерживает Range-запросы).
// В prod файл отдаётся same-origin, поэтому используем window.location.origin.
const API_ORIGIN = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL ?? "http://localhost:8000")
  : window.location.origin;
const FOREST_PMTILES_URL = `pmtiles://${API_ORIGIN}/tiles/forest.pmtiles`;
const WATER_PMTILES_URL = `pmtiles://${API_ORIGIN}/tiles/water.pmtiles`;
const OOPT_PMTILES_URL = `pmtiles://${API_ORIGIN}/tiles/oopt.pmtiles`;
const ROADS_PMTILES_URL = `pmtiles://${API_ORIGIN}/tiles/roads.pmtiles`;

// ─── Отображение типов леса ───────────────────────────────────────────────────
const FOREST_NAMES: Record<string, string> = {
  pine: "Сосновый лес",
  spruce: "Ельник",
  larch: "Лиственничник",
  fir: "Пихтовый лес",
  cedar: "Кедровник",
  birch: "Берёзовый лес",
  aspen: "Осинник",
  alder: "Ольшаник",
  oak: "Дубрава",
  linden: "Липовый лес",
  maple: "Кленовый лес",
  mixed_coniferous: "Смешанный хвойный",
  mixed_broadleaved: "Смешанный лиственный",
  mixed: "Смешанный лес",
  unknown: "Лес (тип не определён)",
};

const EDIBILITY_STYLE: Record<string, string> = {
  edible: "color:#2e7d32;font-weight:600",
  conditionally_edible: "color:#e65100;font-weight:600",
  inedible: "color:#757575",
  toxic: "color:#c62828;font-weight:600",
  deadly: "color:#b71c1c;font-weight:700",
};

const MONTH_SHORT = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
const ROMAN = ["", "I", "II", "III", "IV", "V"];

function buildPopupHtml(data: ForestAtResponse): string {
  if (!data.forest) {
    return `<div style="font-family:sans-serif;padding:4px 2px;color:#555">
      Вне лесных полигонов
    </div>`;
  }

  const f = data.forest;
  const forestName = FOREST_NAMES[f.dominant_species] ?? f.dominant_species;
  const areaStr = f.area_m2 ? `${(f.area_m2 / 10_000).toFixed(1)} га` : "";
  const curMonth = new Date().getMonth() + 1;

  const metaBits: string[] = [];
  if (f.bonitet != null && f.bonitet >= 1 && f.bonitet <= 5)
    metaBits.push(`бонитет ${ROMAN[f.bonitet]}`);
  if (f.timber_stock != null)
    metaBits.push(`${Math.round(f.timber_stock)} м³/га`);
  if (f.age_group != null)
    metaBits.push(f.age_group);
  const metaStr = metaBits.join(" · ");

  const speciesRows = data.species_theoretical
    .slice(0, 12)
    .map((s) => {
      const style = EDIBILITY_STYLE[s.edibility ?? ""] ?? "color:#333";
      const inSeason = (s.season_months ?? []).includes(curMonth);
      const months = (s.season_months ?? [])
        .map((m) =>
          m === curMonth
            ? `<b style="text-decoration:underline">${MONTH_SHORT[m - 1]}</b>`
            : MONTH_SHORT[m - 1]
        )
        .join("&thinsp;");
      const aff = s.affinity ? Math.round(s.affinity * 100) : 0;
      return `<tr class="sp-row${inSeason ? " sp-season" : " sp-offseason"}" style="display:table-row">
        <td style="${style};padding:2px 6px 2px 0">${s.name_ru}</td>
        <td style="color:#aaa;font-size:10px;padding:2px 6px 2px 0;font-style:italic">${s.name_lat ?? ""}</td>
        <td style="font-size:10px;color:#555;padding:2px 6px 2px 0;white-space:nowrap">${months}</td>
        <td style="font-size:10px;color:#888;padding:2px 0">${aff}%</td>
      </tr>`;
    })
    .join("");

  return `<div style="font-family:sans-serif;font-size:13px;min-width:260px;max-width:340px;line-height:1.4">
    <div style="margin-bottom:6px">
      <strong style="font-size:14px">${forestName}</strong>
      ${areaStr ? `<span style="font-size:11px;color:#aaa;margin-left:8px">${areaStr}</span>` : ""}
      ${metaStr ? `<div style="font-size:11px;color:#888;margin-top:2px">${metaStr}</div>` : ""}
      <div style="font-size:10px;color:#bbb;margin-top:1px">${f.source} · уверенность ${Math.round(f.confidence * 100)}%</div>
    </div>
    ${speciesRows ? `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <span style="font-size:11px;color:#888">Виды грибов</span>
        <label style="font-size:10px;color:#666;cursor:pointer;display:flex;align-items:center;gap:3px">
          <input type="checkbox" id="sp-filter-cb" style="margin:0"
            onchange="document.querySelectorAll('.sp-offseason').forEach(r => r.style.display = this.checked ? 'none' : 'table-row')">
          только в сезоне
        </label>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="font-size:10px;color:#aaa;border-bottom:1px solid #eee">
          <th style="text-align:left;padding:0 6px 3px 0">Гриб</th>
          <th></th>
          <th style="text-align:left;padding:0 6px 3px 0">Сезон</th>
          <th style="text-align:left">Афф.</th>
        </tr></thead>
        <tbody>${speciesRows}</tbody>
      </table>`
    : `<p style="color:#aaa;font-size:12px;margin:0">Нет данных о видах для этого типа леса</p>`}
  </div>`;
}

/**
 * Ищет id самого нижнего symbol-слоя (текст/иконки) в текущем стиле —
 * чтобы вставить наш forest-слой под ним. Так надписи городов, улиц,
 * озёр остаются поверх лесной раскраски.
 *
 * OpenFreeMap Bright использует slug'и вроде `label_country`, `place_city`,
 * `road_label_*`, но единственный надёжный инвариант — `layer.type === "symbol"`.
 */
function findFirstSymbolLayerId(m: Map): string | undefined {
  const layers = m.getStyle().layers ?? [];
  for (const l of layers) {
    if (l.type === "symbol") return l.id;
  }
  return undefined;
}

/**
 * Добавляет лесной слой с flat-цветами. Синхронно, без лишних сетевых запросов.
 * Тайлы PMTiles подгружаются лениво по мере панорамирования/зума.
 */
function addForestLayer(m: Map) {
  if (m.getLayer("forest-fill")) return; // слой уже добавлен

  // Source может пережить setStyle (diff-режим), а слой — нет. Добавляем source
  // только если его нет.
  if (!m.getSource("forest")) {
    m.addSource("forest", {
      type: "vector",
      url: FOREST_PMTILES_URL,
    });
  }
  const beforeId = findFirstSymbolLayerId(m);

  m.addLayer(
    {
      id: "forest-fill",
      type: "fill",
      source: "forest",
      "source-layer": "forest",
      paint: FOREST_LAYER_PAINT_COLOR as unknown as maplibregl.FillLayerSpecification["paint"],
    },
    beforeId,
  );
  // outline убран: явные линии по каждому краю полигона дают "блочный" вид;
  // цветовые переходы между породами и так видны на границах.
}

function addOoptLayer(m: Map) {
  if (m.getLayer("oopt-fill")) return;
  if (!m.getSource("oopt")) {
    m.addSource("oopt", { type: "vector", url: OOPT_PMTILES_URL });
  }
  const beforeId = findFirstSymbolLayerId(m);
  m.addLayer(
    {
      id: "oopt-fill",
      type: "fill",
      source: "oopt",
      "source-layer": "oopt",
      paint: {
        "fill-color": [
          "match", ["get", "oopt_category"],
          "zapovednik",    "#b71c1c",
          "nat_park",      "#e65100",
          "prirodny_park", "#f57f17",
          "zakaznik",      "#558b2f",
          "pamyatnik",     "#6a1b9a",
          "#455a64",
        ],
        "fill-opacity": 0.25,
        "fill-antialias": false,
      } as unknown as maplibregl.FillLayerSpecification["paint"],
    },
    beforeId,
  );
}

function addRoadsLayer(m: Map) {
  if (m.getLayer("roads-line")) return;
  if (!m.getSource("roads")) {
    m.addSource("roads", { type: "vector", url: ROADS_PMTILES_URL });
  }
  m.addLayer({
    id: "roads-line",
    type: "line",
    source: "roads",
    "source-layer": "roads",
    minzoom: 10,
    paint: {
      "line-color": "#5d4037",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 14, 2],
      "line-opacity": 0.7,
      "line-dasharray": [3, 2],
    } as unknown as maplibregl.LineLayerSpecification["paint"],
  });
}

function addWaterLayer(m: Map) {
  if (m.getLayer("water-fill")) return;
  if (!m.getSource("water")) {
    m.addSource("water", {
      type: "vector",
      url: WATER_PMTILES_URL,
    });
  }
  const beforeId = findFirstSymbolLayerId(m);
  m.addLayer(
    {
      id: "water-fill",
      type: "fill",
      source: "water",
      "source-layer": "water",
      paint: {
        "fill-color": "#1565C0",
        "fill-opacity": 0.3,
        "fill-antialias": false,
      } as unknown as maplibregl.FillLayerSpecification["paint"],
    },
    beforeId,
  );
}

// ─── Встроенный стиль (fallback если внешний недоступен) ─────────────────────
const INLINE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
};

// ─── Спутниковый стиль (ESRI World Imagery, бесплатно, без ключа) ────────────
const SATELLITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    esri: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        "Imagery © Esri, Maxar, Earthstar Geographics, USDA FSA, USGS, AeroGRID, IGN, GIS Community",
    },
  },
  layers: [{ id: "esri", type: "raster", source: "esri" }],
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
};

// ─── Схема — Versatiles Colorful, подгружается MapLibre'ом напрямую ──────────
// URL стиля, MapLibre фетчит JSON + glyphs + sprites + tiles с tiles.versatiles.org.
// После загрузки увеличиваем text-size в finishSetup ниже.
const SCHEME_STYLE_URL = "https://tiles.versatiles.org/assets/styles/colorful.json";

const SCHEME_STYLE_FALLBACK: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    esri_topo: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© Esri, USGS, NOAA",
    },
  },
  layers: [{ id: "esri_topo", type: "raster", source: "esri_topo" }],
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
};

// ─── Гибрид — ESRI спутник + векторные подписи Versatiles ────────────────────
// Берём Versatiles Colorful, оставляем только symbol-слои (подписи),
// инжектим ESRI satellite raster как самый нижний слой. Подписи векторные →
// на retina чёткие и масштабируемые.
async function buildHybridStyle(): Promise<maplibregl.StyleSpecification> {
  const resp = await fetch(SCHEME_STYLE_URL);
  if (!resp.ok) throw new Error(`Versatiles style fetch failed: ${resp.status}`);
  const style = await resp.json() as maplibregl.StyleSpecification;
  // Добавляем ESRI satellite как новый source
  (style.sources as Record<string, unknown>)["esri-satellite"] = {
    type: "raster",
    tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
    tileSize: 256,
    maxzoom: 19,
    attribution: "Imagery © Esri, Maxar",
  };
  // Оставляем только symbol-слои (подписи/иконки) + satellite как первый слой
  const symbolLayers = style.layers.filter(l => l.type === "symbol");
  style.layers = [
    { id: "esri-satellite-layer", type: "raster", source: "esri-satellite" } as maplibregl.RasterLayerSpecification,
    ...symbolLayers,
  ];
  return style;
}

// ─── Гибрид фоллбэк — ESRI спутник + ESRI Reference labels ───────────────────
const HYBRID_STYLE_FALLBACK: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Imagery © Esri, Maxar",
    },
    labels: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 14,
      attribution: "Labels © Esri",
    },
  },
  layers: [
    { id: "satellite", type: "raster", source: "satellite" },
    { id: "labels", type: "raster", source: "labels" },
  ],
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
};

// ─── Компонент ────────────────────────────────────────────────────────────────

function setForestVisibility(m: Map, visible: boolean) {
  if (m.getLayer("forest-fill"))
    m.setLayoutProperty("forest-fill", "visibility", visible ? "visible" : "none");
}

function setWaterVisibility(m: Map, visible: boolean) {
  if (m.getLayer("water-fill"))
    m.setLayoutProperty("water-fill", "visibility", visible ? "visible" : "none");
}

function setOoptVisibility(m: Map, visible: boolean) {
  if (m.getLayer("oopt-fill"))
    m.setLayoutProperty("oopt-fill", "visibility", visible ? "visible" : "none");
}

function setRoadsVisibility(m: Map, visible: boolean) {
  if (m.getLayer("roads-line"))
    m.setLayoutProperty("roads-line", "visibility", visible ? "visible" : "none");
}

export function MapView() {
  const mapRef = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const [baseMap, setBaseMap] = useState<BaseMapMode>("osm");
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Refs для доступа из стабильных колбэков без пересоздания
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
  // Отслеживаем уже применённый baseMap чтобы не вызывать setStyle зря
  // (совпадает с начальным значением useState, чтобы первый рендер был no-op)
  const appliedBaseMap = useRef<BaseMapMode>("osm");

  // Вызывается при смене стиля — переaddит лесной и водоохранный слои если они загружены.
  // Перед добавлением принудительно удаляем остатки предыдущего стиля: setStyle с
  // diff=true может оставить source живым но снести layer, что приводит к тому что
  // addForestLayer видит source и делает early-return не добавив layer.
  const setupForestAndInteractions = useCallback((m: Map) => {
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
  }, []);

  // Единый обработчик кнопки: первый клик — загружает, последующие — тоглят
  const handleForestToggle = useCallback(() => {
    const m = map.current;
    if (!m) return;
    if (!forestLoadedRef.current) {
      forestLoadedRef.current = true;
      setForestLoaded(true);
      addForestLayer(m);
      forestVisibleRef.current = true;
      setForestVisible(true);
      setForestVisibility(m, true);
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
      addWaterLayer(m);
      waterVisibleRef.current = true; setWaterVisible(true);
      setWaterVisibility(m, true);
    } else {
      const next = !waterVisibleRef.current;
      waterVisibleRef.current = next; setWaterVisible(next);
      setWaterVisibility(m, next);
    }
  }, []);

  const handleOoptToggle = useCallback(async () => {
    const m = map.current;
    if (!m) return;
    if (!ooptLoadedRef.current) {
      try {
        const resp = await fetch(`${API_ORIGIN}/tiles/oopt.pmtiles`, { method: "HEAD" });
        if (!resp.ok) {
          setErrorMsg("Данные ООПТ не загружены — запустите ingest_oopt.py и build_oopt_tiles.py");
          setTimeout(() => setErrorMsg(null), 5000);
          return;
        }
      } catch {
        setErrorMsg("Не удалось проверить наличие тайлов ООПТ");
        setTimeout(() => setErrorMsg(null), 4000);
        return;
      }
      ooptLoadedRef.current = true; setOoptLoaded(true);
      addOoptLayer(m);
      ooptVisibleRef.current = true; setOoptVisible(true);
      setOoptVisibility(m, true);
    } else {
      const next = !ooptVisibleRef.current;
      ooptVisibleRef.current = next; setOoptVisible(next);
      setOoptVisibility(m, next);
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

  const handleRoadsToggle = useCallback(async () => {
    const m = map.current;
    if (!m) return;
    if (!roadsLoadedRef.current) {
      try {
        const resp = await fetch(`${API_ORIGIN}/tiles/roads.pmtiles`, { method: "HEAD" });
        if (!resp.ok) {
          setErrorMsg("Данные дорог не загружены — запустите ingest_osm_roads.py и build_roads_tiles.py");
          setTimeout(() => setErrorMsg(null), 5000);
          return;
        }
      } catch {
        setErrorMsg("Не удалось проверить наличие тайлов дорог");
        setTimeout(() => setErrorMsg(null), 4000);
        return;
      }
      roadsLoadedRef.current = true; setRoadsLoaded(true);
      addRoadsLayer(m);
      roadsVisibleRef.current = true; setRoadsVisible(true);
      setRoadsVisibility(m, true);
    } else {
      const next = !roadsVisibleRef.current;
      roadsVisibleRef.current = next; setRoadsVisible(next);
      setRoadsVisibility(m, next);
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

    // Добавляем лесной слой как только стиль обработан (isStyleLoaded = true),
    // но НЕ ждём загрузки тайлов подложки (load ждёт тайлы — если CDN завис,
    // load никогда не стреляет). styledata может выстрелить до того как стиль
    // применён, поэтому проверяем isStyleLoaded() в каждом вызове.
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

    // Координаты под курсором
    m.on("mousemove", (e) => setCursor({ lat: e.lngLat.lat, lon: e.lngLat.lng }));

    // Синхронизация URL
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

    // ─── Popup по клику ───────────────────────────────────────────────────────
    m.on("click", "forest-fill", async (e) => {
      if (!e.lngLat) return;
      const { lng, lat } = e.lngLat;

      const popup = new maplibregl.Popup({ maxWidth: "380px" })
        .setLngLat([lng, lat])
        .setHTML(`<div style="font-family:sans-serif;color:#555;padding:4px">Загружаю…</div>`)
        .addTo(m);

      try {
        const data = await fetchForestAt(lat, lng);
        popup.setHTML(buildPopupHtml(data));
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

  // Смена базовой подложки. Все 4 стиля — inline растровые, setStyle возвращает
  // управление мгновенно, styledata выстрелит в том же тике. Никакого оверлея
  // «Загружаю подложку» не нужно — тайлы подтягиваются лениво при панорамировании.
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    if (appliedBaseMap.current === baseMap) return;
    appliedBaseMap.current = baseMap;

    let cancelled = false;

    // После загрузки стиля: увеличиваем text-size во всех symbol-слоях через
    // MapLibre API (надёжнее чем пре-обработка JSON), плюс ставим лесные слои.
    const LABEL_SCALE = 1.8;
    const finishSetup = () => {
      if (cancelled) return;
      if (!m.isStyleLoaded()) return;
      m.off("styledata", finishSetup);
      for (const layer of m.getStyle().layers) {
        if (layer.type !== "symbol") continue;
        try {
          const cur = m.getLayoutProperty(layer.id, "text-size");
          if (cur == null) continue;
          if (typeof cur === "number") {
            m.setLayoutProperty(layer.id, "text-size", cur * LABEL_SCALE);
          } else {
            // expression → wrap in ["*", factor, expr]
            m.setLayoutProperty(layer.id, "text-size", ["*", LABEL_SCALE, cur] as unknown as number);
          }
        } catch { /* data-driven / missing prop */ }
      }
      setupForestAndInteractions(m);
    };

    const applyStyle = (style: maplibregl.StyleSpecification | string) => {
      if (cancelled || appliedBaseMap.current !== baseMap) return;
      m.on("styledata", finishSetup);
      m.setStyle(style as maplibregl.StyleSpecification);
    };

    if (baseMap === "scheme") {
      // URL-based load — MapLibre сам фетчит JSON + glyphs/sprites + tiles
      applyStyle(SCHEME_STYLE_URL);
      // Fallback: если за 5 сек стиль не загрузился — ESRI Topo raster
      const fbTimer = setTimeout(() => {
        if (!cancelled && !m.isStyleLoaded() && appliedBaseMap.current === "scheme") {
          m.off("styledata", finishSetup);
          applyStyle(SCHEME_STYLE_FALLBACK);
        }
      }, 5000);
      return () => {
        cancelled = true;
        clearTimeout(fbTimer);
        m.off("styledata", finishSetup);
      };
    } else if (baseMap === "hybrid") {
      buildHybridStyle()
        .then(applyStyle)
        .catch(() => applyStyle(HYBRID_STYLE_FALLBACK));
    } else {
      applyStyle(baseMap === "satellite" ? SATELLITE_STYLE : INLINE_STYLE);
    }

    return () => {
      cancelled = true;
      m.off("styledata", finishSetup);
    };
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
        onShare={handleShare}
      />

      <SearchBar onFlyTo={handleFlyTo} onSpeciesFilter={handleSpeciesFilter} />

      {forestLoaded && <Legend colorMode={forestColorMode} />}

      {/* Координаты под курсором */}
      {cursor && (
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

      {/* Тост «ссылка скопирована» */}
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

      {/* Ошибка загрузки слоя */}
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

      {/* Баннер активного фильтра по виду */}
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
