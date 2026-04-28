/**
 * CursorReadout — мелкий бокс с координатами под курсором (desktop only).
 */
import type { Map } from "maplibre-gl";

import { useIsMobile } from "../../lib/useIsMobile";
import { useMouseLngLat } from "./hooks/useMouseLngLat";
import styles from "./CursorReadout.module.css";

interface Props {
  mapRef: React.MutableRefObject<Map | null>;
}

export function CursorReadout({ mapRef }: Props) {
  const mobile = useIsMobile();
  const cursor = useMouseLngLat(mapRef);
  if (mobile || !cursor) return null;
  return (
    <div className={styles.box}>
      {cursor.lat.toFixed(5)}, {cursor.lon.toFixed(5)}
    </div>
  );
}
