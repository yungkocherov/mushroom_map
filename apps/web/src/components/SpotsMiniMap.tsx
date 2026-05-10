/**
 * SpotsMiniMap — лёгкий MapLibre-превью для /spots.
 *
 * V4 (redesign-2026-05-10): scheme-подложка вместо OSM raster.
 * V4.1 fix: точки перестали отображаться после перехода на scheme.
 *   Причина — `m.on("load")` ненадёжен после async setStyle (style.json
 *   фетчится через buildSchemeStyle, к моменту load-handler may have
 *   already fired). Решение — RAF-poll до `isStyleLoaded`, как в
 *   useBaseMap.ts. Тот же паттерн закладывает CLAUDE.md гача про
 *   «MapLibre `load` event может никогда не выстрелить».
 *
 * Наружу через ref торчит `flyTo(lat, lon, zoom?)` — родитель приближает
 * карту по клику на строку списка (без navigate'а).
 *
 * Не использует общий MapView — собственный экземпляр + один circle-layer.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import maplibregl, { Map as MaplibreMap } from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import type { UserSpot } from "@mushroom-map/types";
import {
  buildSchemeStyle,
  SCHEME_STYLE_FALLBACK,
} from "./mapView/styles/scheme";
import { RATING_HEX } from "../lib/spotRating";

const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile.bind(protocol));

interface Props {
  spots: UserSpot[];
  highlightedId: string | null;
}

export interface SpotsMiniMapHandle {
  flyTo: (lat: number, lon: number, zoom?: number) => void;
}

const LO_CENTER: [number, number] = [30.5, 59.9];
const LO_DEFAULT_ZOOM = 7.2;
const SOURCE_ID = "spots-src";
const LAYER_ID = "spots-circle";

function spotsToGeoJson(spots: UserSpot[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: spots.map((s) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.lon, s.lat] },
      properties: {
        id:     s.id,
        name:   s.name,
        rating: s.rating,
      },
    })),
  };
}

function ensureLayerSetup(m: MaplibreMap) {
  if (m.getSource(SOURCE_ID)) return;
  m.addSource(SOURCE_ID, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  m.addLayer({
    id: LAYER_ID,
    type: "circle",
    source: SOURCE_ID,
    paint: {
      "circle-radius":       ["interpolate", ["linear"], ["zoom"], 5, 5, 12, 9, 16, 13],
      "circle-color": [
        "match",
        ["get", "rating"],
        1, RATING_HEX[1],
        2, RATING_HEX[2],
        3, RATING_HEX[3],
        4, RATING_HEX[4],
        5, RATING_HEX[5],
        RATING_HEX[3],
      ],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
      "circle-opacity":      0.95,
    },
  });
  m.on("mouseenter", LAYER_ID, () => {
    m.getCanvas().style.cursor = "pointer";
  });
  m.on("mouseleave", LAYER_ID, () => {
    m.getCanvas().style.cursor = "";
  });
}

export const SpotsMiniMap = forwardRef<SpotsMiniMapHandle, Props>(
  function SpotsMiniMap({ spots, highlightedId }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<MaplibreMap | null>(null);
    // Pending data, накопленное между mount'ом и `isStyleLoaded`. Важно
    // чтобы первая партия spots'ов не потерялась если они пришли раньше
    // чем style успел загрузиться.
    const pendingSpotsRef = useRef<UserSpot[] | null>(null);

    useImperativeHandle(ref, () => ({
      flyTo: (lat, lon, zoom = 13) => {
        const m = mapRef.current;
        if (!m) return;
        m.flyTo({ center: [lon, lat], zoom, speed: 1.2, essential: true });
      },
    }), []);

    // init map once — async scheme-style fetch с fallback'ом + RAF-poll
    // вместо нестабильного `m.on('load')`.
    useEffect(() => {
      if (!containerRef.current || mapRef.current) return;

      let cancelled = false;
      const init = async () => {
        let style: maplibregl.StyleSpecification;
        try {
          style = await buildSchemeStyle();
        } catch {
          style = SCHEME_STYLE_FALLBACK;
        }
        if (cancelled || !containerRef.current) return;

        const m = new maplibregl.Map({
          container: containerRef.current,
          style,
          center: LO_CENTER,
          zoom: LO_DEFAULT_ZOOM,
          attributionControl: { compact: true },
        });
        mapRef.current = m;

        const onReady = () => {
          if (cancelled) return;
          if (!m.isStyleLoaded()) {
            requestAnimationFrame(onReady);
            return;
          }
          ensureLayerSetup(m);
          // Применяем накопленные spots (если data-effect успел стрельнуть
          // до style-готовности).
          const pending = pendingSpotsRef.current;
          if (pending) {
            applySpots(m, pending);
            pendingSpotsRef.current = null;
          }
        };
        requestAnimationFrame(onReady);
      };
      void init();

      return () => {
        cancelled = true;
        mapRef.current?.remove();
        mapRef.current = null;
      };
    }, []);

    // update spots data + auto-fit. Если style ещё не готов — складываем
    // в ref'у, поднимем как только styledata + isStyleLoaded.
    useEffect(() => {
      const m = mapRef.current;
      if (!m || !m.isStyleLoaded() || !m.getSource(SOURCE_ID)) {
        pendingSpotsRef.current = spots;
        return;
      }
      applySpots(m, spots);
    }, [spots]);

    // highlight: пересобираем paint-expressions при смене highlightedId.
    useEffect(() => {
      const m = mapRef.current;
      if (!m || !m.getLayer(LAYER_ID)) return;
      const target = highlightedId ?? "__none__";
      m.setPaintProperty(LAYER_ID, "circle-stroke-width", [
        "case",
        ["==", ["get", "id"], target], 4,
        2,
      ]);
      m.setPaintProperty(LAYER_ID, "circle-radius", [
        "case",
        ["==", ["get", "id"], target],
        ["interpolate", ["linear"], ["zoom"], 5, 8, 12, 12, 16, 16],
        ["interpolate", ["linear"], ["zoom"], 5, 5, 12, 9, 16, 13],
      ]);
    }, [highlightedId]);

    return (
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", minHeight: 320, borderRadius: 8, overflow: "hidden" }}
        aria-label="Карта моих точек"
        role="region"
      />
    );
  },
);

function applySpots(m: MaplibreMap, spots: UserSpot[]) {
  const src = m.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  src.setData(spotsToGeoJson(spots));
  if (spots.length === 0) return;
  if (spots.length === 1) {
    m.easeTo({ center: [spots[0].lon, spots[0].lat], zoom: 11, duration: 400 });
    return;
  }
  const lons = spots.map((s) => s.lon);
  const lats = spots.map((s) => s.lat);
  const bounds = new maplibregl.LngLatBounds(
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  );
  m.fitBounds(bounds, { padding: 40, maxZoom: 11, duration: 400 });
}
