/**
 * useMouseLngLat — слушает m.on('mousemove'), возвращает {lat, lon} | null.
 * На touch-устройствах не нужен — mousemove не триггерится.
 */
import { useEffect, useState } from "react";
import type { Map, MapMouseEvent } from "maplibre-gl";

export function useMouseLngLat(
  mapRef: React.MutableRefObject<Map | null>,
): { lat: number; lon: number } | null {
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null);
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const handler = (e: MapMouseEvent) => {
      setPos({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    };
    m.on("mousemove", handler);
    return () => {
      m.off("mousemove", handler);
    };
  }, [mapRef]);
  return pos;
}
