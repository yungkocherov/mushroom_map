/**
 * SpotsMiniMap — лёгкий MapLibre-превью для /spots.
 *
 * V4 (redesign-2026-05-10):
 *   - подложка теперь scheme (Versatiles Colorful), как на /map; раньше
 *     был OSM raster через INLINE_STYLE — несогласованно с остальным UI
 *   - наружу через ref торчит `flyTo(lat, lon, zoom?)` чтобы родитель
 *     мог приближать карту по клику строки в списке (без navigate)
 *   - убрали onSelect: клик по точке больше не уводит на /spots/<id>
 *
 * Не использует общий MapView (954 строк, тащит forest/water/oopt/etc) —
 * собственный экземпляр + один circle-layer с user_spot.
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

export const SpotsMiniMap = forwardRef<SpotsMiniMapHandle, Props>(
  function SpotsMiniMap({ spots, highlightedId }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<MaplibreMap | null>(null);

    useImperativeHandle(ref, () => ({
      flyTo: (lat, lon, zoom = 13) => {
        const m = mapRef.current;
        if (!m) return;
        m.flyTo({ center: [lon, lat], zoom, speed: 1.2, essential: true });
      },
    }), []);

    // init map once — подменяем scheme-style ассинхронно через build*().
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

        m.on("load", () => {
          m.addSource("spots-src", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
          m.addLayer({
            id: "spots-circle",
            type: "circle",
            source: "spots-src",
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
          m.on("mouseenter", "spots-circle", () => {
            m.getCanvas().style.cursor = "pointer";
          });
          m.on("mouseleave", "spots-circle", () => {
            m.getCanvas().style.cursor = "";
          });
        });
      };
      void init();

      return () => {
        cancelled = true;
        mapRef.current?.remove();
        mapRef.current = null;
      };
    }, []);

    // update spots data + auto-fit bounds
    useEffect(() => {
      const m = mapRef.current;
      if (!m) return;
      const apply = () => {
        const src = m.getSource("spots-src") as maplibregl.GeoJSONSource | undefined;
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
      };
      if (m.isStyleLoaded()) apply();
      else m.once("load", apply);
    }, [spots]);

    // highlight: пересобираем paint-expressions при смене highlightedId.
    useEffect(() => {
      const m = mapRef.current;
      if (!m || !m.getLayer("spots-circle")) return;
      const target = highlightedId ?? "__none__";
      m.setPaintProperty("spots-circle", "circle-stroke-width", [
        "case",
        ["==", ["get", "id"], target], 4,
        2,
      ]);
      m.setPaintProperty("spots-circle", "circle-radius", [
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
