/**
 * useMapUrl — синхронизирует текущий center+zoom карты в URL query
 * (?lat&lon&z) через history.replaceState. На back/forward не реагирует
 * (одностороння — карта пишет в URL).
 */
import { useEffect } from "react";
import type { Map } from "maplibre-gl";

export function useMapUrl(mapRef: React.MutableRefObject<Map | null>) {
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const sync = () => {
      const { lat, lng } = m.getCenter();
      const z = Math.round(m.getZoom() * 10) / 10;
      const url = new URL(window.location.href);
      url.searchParams.set("lat", lat.toFixed(5));
      url.searchParams.set("lon", lng.toFixed(5));
      url.searchParams.set("z", String(z));
      history.replaceState(null, "", url.toString());
    };
    m.on("moveend", sync);
    return () => {
      m.off("moveend", sync);
    };
  }, [mapRef]);
}
