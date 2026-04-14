import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl, { Map } from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";

import { FOREST_LAYER_PAINT_COLOR } from "../lib/forestStyle";
import { fetchForestAt, ForestAtResponse } from "../lib/api";
import { MapControls, BaseMapMode } from "./MapControls";

// ─── PMTiles protocol ─────────────────────────────────────────────────────────
const _protocol = new Protocol();
maplibregl.addProtocol("pmtiles", _protocol.tile.bind(_protocol));

// В dev PMTiles идёт напрямую к API (Vite proxy не поддерживает Range-запросы).
// В prod файл отдаётся same-origin, поэтому используем window.location.origin.
const API_ORIGIN = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL ?? "http://localhost:8000")
  : window.location.origin;
const FOREST_PMTILES_URL = `pmtiles://${API_ORIGIN}/tiles/forest.pmtiles`;

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

  const speciesRows = data.species_theoretical
    .slice(0, 8)
    .map((s) => {
      const style = EDIBILITY_STYLE[s.edibility ?? ""] ?? "color:#333";
      const months = (s.season_months ?? [])
        .map((m) =>
          m === curMonth
            ? `<b style="text-decoration:underline">${MONTH_SHORT[m - 1]}</b>`
            : MONTH_SHORT[m - 1]
        )
        .join("&thinsp;");
      const aff = s.affinity ? Math.round(s.affinity * 100) : 0;
      return `<tr>
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
      <div style="font-size:10px;color:#bbb;margin-top:1px">${f.source} · уверенность ${Math.round(f.confidence * 100)}%</div>
    </div>
    ${speciesRows
      ? `<table style="width:100%;border-collapse:collapse">
           <thead><tr style="font-size:10px;color:#aaa;border-bottom:1px solid #eee">
             <th style="text-align:left;padding:0 6px 3px 0">Гриб</th>
             <th></th>
             <th style="text-align:left;padding:0 6px 3px 0">Сезон</th>
             <th style="text-align:left">Афф.</th>
           </tr></thead>
           <tbody>${speciesRows}</tbody>
         </table>`
      : `<p style="color:#aaa;font-size:12px;margin:0">Нет данных о видах для этого типа леса</p>`
    }
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
  if (m.getSource("forest")) return; // уже добавлен

  m.addSource("forest", {
    type: "vector",
    url: FOREST_PMTILES_URL,
  });
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
  m.addLayer(
    {
      id: "forest-outline",
      type: "line",
      source: "forest",
      "source-layer": "forest",
      paint: { "line-color": "#2a1f14", "line-width": 0.6, "line-opacity": 1 },
      minzoom: 11,
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
  sprite: "",
};

// ─── Спутниковый стиль (ESRI World Imagery, бесплатно, без ключа) ────────────
// Качество хорошее для России, атрибуция Esri (требуется лицензией).
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
  sprite: "",
};

const SCHEME_STYLE_URL = "https://tiles.openfreemap.org/styles/bright";

// ─── Компонент ────────────────────────────────────────────────────────────────

function setForestVisibility(m: Map, visible: boolean) {
  const v = visible ? "visible" : "none";
  for (const id of ["forest-fill", "forest-outline"]) {
    if (m.getLayer(id)) {
      m.setLayoutProperty(id, "visibility", v);
    }
  }
}

export function MapView() {
  const mapRef = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const [baseMap, setBaseMap] = useState<BaseMapMode>("osm");
  const [forestVisible, setForestVisible] = useState(true);
  const [forestLoaded, setForestLoaded] = useState(false);

  // Refs для доступа из стабильных колбэков без пересоздания
  const forestVisibleRef = useRef(forestVisible);
  forestVisibleRef.current = forestVisible;
  const forestLoadedRef = useRef(false);

  // Вызывается при смене стиля — переaddит лесной слой только если он уже был загружен
  const setupForestAndInteractions = useCallback((m: Map) => {
    if (!forestLoadedRef.current) return;
    addForestLayer(m);
    setForestVisibility(m, forestVisibleRef.current);
  }, []);

  // Вызывается по кнопке "Загрузить леса"
  const handleLoadForest = useCallback(() => {
    const m = map.current;
    if (!m) return;
    forestLoadedRef.current = true;
    setForestLoaded(true);
    addForestLayer(m);
    setForestVisibility(m, forestVisibleRef.current);
  }, []);

  useEffect(() => {
    if (!mapRef.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapRef.current,
      style: INLINE_STYLE,
      center: [30.5, 60.0],
      zoom: 8,
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

    // Если внешний стиль не загрузился — fallback на inline (только в начальной загрузке)
    m.on("error", (e) => {
      if (
        typeof e.error?.message === "string" &&
        (e.error.message.includes("style") ||
          e.error.message.includes("tiles.openfreemap"))
      ) {
        if (baseMap === "scheme") {
          m.setStyle(INLINE_STYLE);
          m.once("styledata", () => setupForestAndInteractions(m));
        }
      }
    });

    m.addControl(new maplibregl.NavigationControl(), "top-right");
    m.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );

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

    m.on("mouseenter", "forest-fill", () => {
      m.getCanvas().style.cursor = "pointer";
    });
    m.on("mouseleave", "forest-fill", () => {
      m.getCanvas().style.cursor = "";
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Смена базовой подложки — setStyle сбрасывает sources/layers,
  // ждём styledata и переadd'им forest.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const loaded = m.loaded();
    if (!loaded) return;

    const target =
      baseMap === "scheme" ? SCHEME_STYLE_URL
      : baseMap === "satellite" ? SATELLITE_STYLE
      : INLINE_STYLE;
    m.setStyle(target as maplibregl.StyleSpecification | string);
    const onSwitch = () => {
      if (m.isStyleLoaded()) {
        m.off("styledata", onSwitch);
        setupForestAndInteractions(m);
      }
    };
    m.on("styledata", onSwitch);
  }, [baseMap, setupForestAndInteractions]);

  // Видимость лесного слоя — дешёвая операция, не требует пересборки
  useEffect(() => {
    const m = map.current;
    if (!m || !m.loaded()) return;
    setForestVisibility(m, forestVisible);
  }, [forestVisible]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={mapRef} className="map-root" />
      <MapControls
        baseMap={baseMap}
        onBaseMapChange={setBaseMap}
        forestVisible={forestVisible}
        onForestToggle={setForestVisible}
        forestLoaded={forestLoaded}
        onForestLoad={handleLoadForest}
      />
    </div>
  );
}
