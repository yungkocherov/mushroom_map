import { useEffect, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

import styles from "./ForestLoadingOverlay.module.css";

/**
 * Full-viewport shimmer overlay пока карта что-то догружает.
 *
 * Отслеживание: `map.areTilesLoaded()` обновляется по `data`-событиям;
 * `idle` событие = всё догружено и spawn-rendered. Per-tile precision
 * (рисовать shimmer на конкретных квадратах) сложна с pmtiles custom
 * protocol — некоторые события не доносят `tile.state`. Full-viewport
 * вариант — простой и надёжный, лёгкий полупрозрачный pulsing
 * gradient поверх карты пока что-то грузится.
 */
interface Props {
  mapRef: React.MutableRefObject<MapLibreMap | null>;
}

export function ForestLoadingOverlay({ mapRef }: Props) {
  const [loading, setLoading] = useState(false);
  const [attachTick, setAttachTick] = useState(0);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      const id = requestAnimationFrame(() => setAttachTick((t) => t + 1));
      return () => cancelAnimationFrame(id);
    }

    const update = () => {
      // areTilesLoaded возвращает false пока хотя бы один тайл (любого
      // source'а) ещё в loading-state. В состоянии стабильного view'а
      // = true, во время pan/zoom = временно false.
      try {
        setLoading(!map.areTilesLoaded());
      } catch {
        // map.removed() может сделать areTilesLoaded() throw'ит — ignore
      }
    };
    const onIdle = () => setLoading(false);

    map.on("data", update);
    map.on("dataloading", update);
    map.on("idle", onIdle);
    map.on("moveend", update);
    map.on("zoomend", update);

    // initial check
    update();

    return () => {
      map.off("data", update);
      map.off("dataloading", update);
      map.off("idle", onIdle);
      map.off("moveend", update);
      map.off("zoomend", update);
    };
  }, [mapRef, attachTick]);

  if (!loading) return null;
  return <div className={styles.overlay} aria-hidden />;
}
