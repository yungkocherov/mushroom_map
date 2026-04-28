/**
 * SpotsMiniMap — лёгкий MapLibre-превью для /spots.
 *
 * Не использует общий MapView (954 строк, тащит forest/water/oopt/etc) —
 * собственный экземпляр на INLINE_STYLE (OSM raster) + один circle-layer
 * со spot'ами. Без PMTiles, без forecast, без forest.
 *
 * Контракт: получает `spots` (отфильтрованные родителем по цвету) +
 * `highlightedId` (для подсветки hover'а из списка) + `onSelect` (клик
 * по точке).
 */

import { useEffect, useRef } from "react";
import maplibregl, { Map as MaplibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { UserSpot } from "@mushroom-map/types";
import { INLINE_STYLE } from "./mapView/styles/inline";
import { SPOT_COLOR_HEX } from "../lib/spotColors";

interface Props {
  spots: UserSpot[];
  highlightedId: string | null;
  onSelect: (id: string) => void;
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
        id:    s.id,
        name:  s.name,
        color: SPOT_COLOR_HEX[s.color] ?? SPOT_COLOR_HEX.forest,
      },
    })),
  };
}

export function SpotsMiniMap({ spots, highlightedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const m = new maplibregl.Map({
      container: containerRef.current,
      style: INLINE_STYLE,
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
          "circle-color":        ["get", "color"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
          "circle-opacity":      0.95,
        },
      });
      m.on("click", "spots-circle", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const id = (f.properties as { id?: string }).id;
        if (id) onSelectRef.current(id);
      });
      m.on("mouseenter", "spots-circle", () => {
        m.getCanvas().style.cursor = "pointer";
      });
      m.on("mouseleave", "spots-circle", () => {
        m.getCanvas().style.cursor = "";
      });
    });

    return () => {
      m.remove();
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
  // GeoJSONSource не даёт setFeatureState без promoteId, а городить
  // promoteId ради одной подсветки — лишнее.
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
      aria-label="Карта моих спотов"
      role="region"
    />
  );
}
