/**
 * useMapShare — возвращает callback, копирующий ?lat&lon&z URL текущего
 * центра/зума карты в clipboard и пускающий тост через store.shareToast.
 */
import { useCallback } from "react";
import type { Map } from "maplibre-gl";

import { useLayerVisibility } from "../../../store/useLayerVisibility";

export function useMapShare(mapRef: React.MutableRefObject<Map | null>) {
  const setShareToast = useLayerVisibility((s) => s.setShareToast);

  return useCallback(() => {
    const m = mapRef.current;
    if (!m) return;
    const { lat, lng } = m.getCenter();
    const z = Math.round(m.getZoom() * 10) / 10;
    const url = new URL(window.location.href);
    url.searchParams.set("lat", lat.toFixed(5));
    url.searchParams.set("lon", lng.toFixed(5));
    url.searchParams.set("z", String(z));
    void navigator.clipboard.writeText(url.toString()).then(() => {
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2000);
    });
  }, [mapRef, setShareToast]);
}
