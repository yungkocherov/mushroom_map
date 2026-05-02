import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, MapDataEvent } from "maplibre-gl";

import styles from "./ForestLoadingOverlay.module.css";

/**
 * Per-tile shimmer overlay для forest-источников. Слушает MapLibre
 * `data` events на обоих source'ах (forest + forest_lo). Когда какой-то
 * tile state === 'loading' — добавляем его в pending Set. Когда loaded
 * (или errored / unloaded) — удаляем.
 *
 * Render: для каждого pending tile вычисляем bbox в lng/lat (стандартная
 * tile-math z/x/y → lng/lat углы), проектируем через map.project() в
 * pixel-координаты и рисуем absolute-positioned div с CSS-shimmer.
 *
 * При панорамировании / зуме перепроецируем — слушаем `move` event,
 * bumpаем version → re-render.
 *
 * Перформанс: requestAnimationFrame batching на move event'ах. Pending
 * Set обновляется по факту, без RAF (один data event = один setState).
 */

type TileKey = string;
type TileCoords = { z: number; x: number; y: number };

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
  ready: boolean;
}

type PendingMap = globalThis.Map<TileKey, TileCoords>;

type TileLikeEvent = MapDataEvent & {
  sourceId?: string;
  tile?: {
    state?: string;
    tileID?: { canonical?: { z: number; x: number; y: number } };
  };
};

export function ForestLoadingOverlay({ mapRef, ready }: Props) {
  const map = ready ? mapRef.current : null;
  // debug: видеть что компонент рендерится вообще
  // eslint-disable-next-line no-console
  console.log("[forest-overlay] render", { ready, hasMap: !!map });
  const [pending, setPending] = useState<PendingMap>(() => new globalThis.Map());
  // bump'аем при move/zoom — provoke'аем re-projection без хранения координат
  const [proj, setProj] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!map) return;
    // eslint-disable-next-line no-console
    console.log("[forest-overlay] listener attached");

    const onData = (e: TileLikeEvent) => {
      // debug: ВСЕ data events без фильтра — посмотреть что прилетает
      // eslint-disable-next-line no-console
      console.log("[forest-overlay-all]", {
        sid: e.sourceId,
        dataType: e.dataType,
        hasTile: !!e.tile,
        tileState: e.tile?.state,
      });
      const sid = e.sourceId;
      if (!sid || !FOREST_SOURCES.includes(sid)) return;
      if (e.dataType !== "source" || !e.tile) return;
      const c = e.tile.tileID?.canonical;
      if (!c) return;
      const key = `${sid}/${c.z}/${c.x}/${c.y}`;
      const state = e.tile.state;
      setPending((prev) => {
        const next: PendingMap = new globalThis.Map(prev);
        if (state === "loading") {
          next.set(key, { z: c.z, x: c.x, y: c.y });
        } else {
          // 'loaded' | 'errored' | 'unloaded' | 'expired' — больше не pending
          next.delete(key);
        }
        return next;
      });
    };

    const onMove = () => {
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setProj((v) => v + 1);
      });
    };

    map.on("data", onData as never);
    map.on("move", onMove);
    map.on("zoom", onMove);
    return () => {
      map.off("data", onData as never);
      map.off("move", onMove);
      map.off("zoom", onMove);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [map]);

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
        // Скрываем тайлы за пределами viewport — не нужно рендерить
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
