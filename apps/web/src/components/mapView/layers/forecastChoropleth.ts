/**
 * forecastChoroplethLayer — fill-полигоны 18 районов ЛО с цветом по
 * forecast-index'у на выбранную дату.
 *
 * Источник: тот же `/api/districts/?region=lenoblast` GeoJSON, что и
 * `districts-line` (18 features). Поверх — `setFeatureState` по `id`
 * (admin_area_id) с numeric `index ∈ [0..5]`. paint expression
 * мапит index → bucket → cssvar (`--idx-0..4`).
 *
 * Public API:
 *   addForecastChoroplethLayer(map)
 *     — добавляет источник `districts` (если не было), и слой
 *       `forecast-choropleth-fill` под `districts-line`.
 *
 *   setForecastChoroplethVisibility(map, visible)
 *     — показать/спрятать. По умолчанию скрыт; включается через
 *       `useLayerVisibility` в overview-mode.
 *
 *   applyForecastIndices(map, rows)
 *     — после получения `/api/forecast/districts?date=YYYY-MM-DD` →
 *       пишем feature-state index для каждого admin_area_id. UI
 *       вызывает это при смене даты в DateScrubber'е (без re-fetch'а
 *       тайлов — Maplibre сам перекрасит).
 */
import type maplibregl from "maplibre-gl";
import type { Map } from "maplibre-gl";

import { API_ORIGIN } from "../utils/api";
import { findFirstSymbolLayerId } from "../utils/findSymbolLayer";
import { DISTRICTS_URL } from "./districts";

export const FORECAST_FILL_LAYER_ID = "forecast-choropleth-fill";

export interface ForecastDistrictRow {
  admin_area_id: number;
  district_name: string;
  district_slug: string | null;
  index: number; // 0..5
  top_species: { slug: string; score: number }[];
  confidence: "preview" | "model";
  generated_at: string;
}

/**
 * Resolve `--idx-N` token at runtime — design tokens live as CSS vars,
 * MapLibre paint can't dereference them, so we read computed style.
 * Caching keyed on `data-theme` attr — light/dark switch invalidates it.
 */
function resolveIndexColors(): string[] {
  if (typeof document === "undefined") {
    // SSR / tests — fallback to light defaults from tokens.css
    return ["#4a6b40", "#5e8050", "#9bb47a", "#bcc890", "#d88c1e"];
  }
  const cs = getComputedStyle(document.documentElement);
  const colors: string[] = [];
  for (let i = 0; i < 5; i++) {
    const v = cs.getPropertyValue(`--idx-${i}`).trim();
    colors.push(v || "#7a9b64");
  }
  return colors;
}

export function addForecastChoroplethLayer(m: Map): void {
  if (m.getLayer(FORECAST_FILL_LAYER_ID)) return;

  if (!m.getSource("districts")) {
    m.addSource("districts", {
      type: "geojson",
      data: DISTRICTS_URL,
      generateId: false,
    });
  }

  const colors = resolveIndexColors();
  const beforeId = findFirstSymbolLayerId(m);

  m.addLayer(
    {
      id: FORECAST_FILL_LAYER_ID,
      type: "fill",
      source: "districts",
      paint: {
        "fill-color": [
          "case",
          ["==", ["feature-state", "index"], null],
          "#cccccc", // no data — neutral grey, opacity drops it out
          [
            "step",
            ["feature-state", "index"],
            colors[0],
            1, colors[1],
            2, colors[2],
            3, colors[3],
            4, colors[4],
          ],
        ],
        "fill-opacity": [
          "case",
          ["==", ["feature-state", "index"], null],
          0.0,
          0.45,
        ],
      } as unknown as maplibregl.FillLayerSpecification["paint"],
      layout: { visibility: "none" },
    },
    beforeId,
  );
}

export function setForecastChoroplethVisibility(m: Map, visible: boolean): void {
  if (m.getLayer(FORECAST_FILL_LAYER_ID))
    m.setLayoutProperty(
      FORECAST_FILL_LAYER_ID,
      "visibility",
      visible ? "visible" : "none",
    );
}

/**
 * Applies index per district via `setFeatureState`. Idempotent:
 * пере-вызов с другой датой просто перезаписывает state.
 *
 * Important: source must already be loaded; if not — defer until
 * `sourcedata` event fires for the source.
 */
export function applyForecastIndices(
  m: Map,
  rows: ForecastDistrictRow[],
): void {
  const apply = () => {
    for (const r of rows) {
      m.setFeatureState(
        { source: "districts", id: r.admin_area_id },
        { index: r.index },
      );
    }
  };
  if (m.isSourceLoaded("districts")) {
    apply();
    return;
  }
  const onData = (ev: maplibregl.MapSourceDataEvent) => {
    if (ev.sourceId === "districts" && ev.isSourceLoaded) {
      apply();
      m.off("sourcedata", onData);
    }
  };
  m.on("sourcedata", onData);
}

/**
 * Fetches `/api/forecast/districts?date=YYYY-MM-DD` and pushes the
 * result through `applyForecastIndices`. Returns the rows so caller
 * can also feed them into Sidebar / popup.
 */
export async function fetchAndApplyForecast(
  m: Map,
  date: string,
  region = "lenoblast",
): Promise<ForecastDistrictRow[]> {
  const url = `${API_ORIGIN}/api/forecast/districts?date=${encodeURIComponent(
    date,
  )}&region=${encodeURIComponent(region)}`;
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) {
    throw new Error(`forecast/districts failed: ${res.status}`);
  }
  const rows = (await res.json()) as ForecastDistrictRow[];
  applyForecastIndices(m, rows);
  return rows;
}
