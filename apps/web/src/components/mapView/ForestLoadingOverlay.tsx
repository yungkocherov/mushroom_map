import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, MapDataEvent } from "maplibre-gl";

import styles from "./ForestLoadingOverlay.module.css";

/**
 * Per-tile shimmer overlay для forest-источников.
 *
 * Стратегия:
 *   - `dataloading` event на forest/forest_lo sources → tile в pending Set
 *   - `data` event на тех же sources → если tile.state === 'loaded'/'errored'
 *     → удаляем из pending
 *   - Render: absolute-positioned div per pending tile, проектируем
 *     z/x/y bounds через map.project()
 *   - На move/zoom — bumpаем version → re-render с новыми pixel-coords
 *
 * Если pmtiles-adapter не доставляет `tile.tileID` в event — fallback'ить
 * нечем (без tile coords нельзя рисовать per-tile shimmer). В этом случае
 * pending Set остаётся пустым и overlay просто не показывается.
 */

type TileKey = string;
type TileCoords = { z: number; x: number; y: number };
type PendingMap = globalThis.Map<TileKey, TileCoords>;

type TileLikeEvent = MapDataEvent & {
  sourceId?: string;
  tile?: {
    state?: string;
    tileID?: { canonical?: { z: number; x: number; y: number } };
  };
};

const FOREST_SOURCES = ["forest", "forest_lo"];

function tileBoundsLngLat(x: number, y: number, z: number) {
  const n = 2 ** z;
  const lonW = (x / n) * 360 - 180;
  const lonE = ((x + 1) / n) * 360 - 180;
  const latN = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  const latS = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI;
  return { nw: [lonW, latN] as [number, number], se: [lonE, latS] as [number, number] };
}

interface Props {
  mapRef: React.MutableRefObject<MapLibreMap | null>;
}

export function ForestLoadingOverlay({ mapRef }: Props) {
  const [pending, setPending] = useState<PendingMap>(() => new globalThis.Map());
  // bumpаем при move/zoom — re-projection без хранения pixel-coords
  const [proj, setProj] = useState(0);
  const [attachTick, setAttachTick] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      const id = requestAnimationFrame(() => setAttachTick((t) => t + 1));
      return () => cancelAnimationFrame(id);
    }

    const updatePending = (e: TileLikeEvent, isLoading: boolean) => {
      const sid = e.sourceId;
      if (!sid || !FOREST_SOURCES.includes(sid)) return;
      const c = e.tile?.tileID?.canonical;
      if (!c) return;
      const key = `${sid}/${c.z}/${c.x}/${c.y}`;
      setPending((prev) => {
        const next: PendingMap = new globalThis.Map(prev);
        if (isLoading && e.tile?.state !== "loaded" && e.tile?.state !== "errored") {
          next.set(key, { z: c.z, x: c.x, y: c.y });
        } else {
          next.delete(key);
        }
        return next;
      });
    };

    const onLoading = (e: TileLikeEvent) => updatePending(e, true);
    const onData = (e: TileLikeEvent) => updatePending(e, false);

    const onMove = () => {
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setProj((v) => v + 1);
      });
    };

    map.on("dataloading", onLoading as never);
    map.on("data", onData as never);
    map.on("move", onMove);
    map.on("zoom", onMove);

    return () => {
      map.off("dataloading", onLoading as never);
      map.off("data", onData as never);
      map.off("move", onMove);
      map.off("zoom", onMove);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [mapRef, attachTick]);

  const map = mapRef.current;
  if (!map || pending.size === 0) return null;

  return (
    <div className={styles.overlay}>
      {Array.from(pending.entries()).map(([key, { z, x, y }]) => {
        const { nw, se } = tileBoundsLngLat(x, y, z);
        const nwPx = map.project(nw);
        const sePx = map.project(se);
        const left = nwPx.x;
        const top = nwPx.y;
        const w = sePx.x - nwPx.x;
        const h = sePx.y - nwPx.y;
        if (w <= 0 || h <= 0) return null;
        return (
          <div
            key={`${key}#${proj}`}
            className={styles.shimmer}
            style={{
              left: `${left}px`,
              top: `${top}px`,
              width: `${w}px`,
              height: `${h}px`,
            }}
          />
        );
      })}
    </div>
  );
}
