/**
 * useMapInstance — создаёт maplibre Map ровно один раз при mount'е,
 * монтирует navigation/attribution controls, возвращает ref на Map.
 *
 * URL `?lat=&lon=&z=` парсятся при инициализации. На unmount — `m.remove()`.
 */
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import maplibregl, { Map } from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";

import { INLINE_STYLE } from "../styles/inline";

const _protocol = new Protocol();
maplibregl.addProtocol("pmtiles", _protocol.tile.bind(_protocol));

export interface InitialView {
  lat: number;
  lon: number;
  zoom: number;
}

export function parseInitialView(): InitialView {
  if (typeof window === "undefined") {
    return { lat: 60.0, lon: 30.5, zoom: 8 };
  }
  const params = new URLSearchParams(window.location.search);
  const lat = parseFloat(params.get("lat") ?? "60.0");
  const lon = parseFloat(params.get("lon") ?? "30.5");
  const zoom = parseFloat(params.get("z") ?? "8");
  return {
    lat: isFinite(lat) ? lat : 60.0,
    lon: isFinite(lon) ? lon : 30.5,
    zoom: isFinite(zoom) ? zoom : 8,
  };
}

export function useMapInstance(
  containerRef: MutableRefObject<HTMLDivElement | null>,
  initialView: InitialView,
  onReady: (map: Map) => void,
): { map: MutableRefObject<Map | null>; ready: boolean } {
  const mapRef = useRef<Map | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const m = new maplibregl.Map({
      container: containerRef.current,
      style: INLINE_STYLE,
      center: [initialView.lon, initialView.lat],
      zoom: initialView.zoom,
      attributionControl: false,
    });
    mapRef.current = m;

    m.addControl(new maplibregl.NavigationControl(), "top-right");

    const onStyleReady = () => {
      if (m.isStyleLoaded()) {
        m.off("styledata", onStyleReady);
        onReady(m);
        setReady(true);
      }
    };
    m.on("styledata", onStyleReady);

    return () => {
      m.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { map: mapRef, ready };
}
