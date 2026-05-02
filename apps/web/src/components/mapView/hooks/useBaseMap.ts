/**
 * useBaseMap — переключает MapLibre style при смене store.baseMap.
 * После setStyle ждёт `isStyleLoaded` через RAF-poll, затем дёргает onAfterApply
 * — там вызывающий должен пере-добавить registry-слои + places + userSpots.
 *
 * Не использует styledata listener: на медленных tile-CDN он промахивается
 * (первый firing isStyleLoaded=false, второй не приходит). RAF-poll даёт
 * предсказуемое «дождаться, потом продолжить».
 *
 * setStyle с diff: false — на тяжёлых стилях (Versatiles ≥60 layers) diff
 * оставляет визуальные артефакты. Полная замена медленнее, но детерминирована.
 */
import { useEffect, useRef } from "react";
import type { Map, StyleSpecification } from "maplibre-gl";

import { useLayerVisibility, type BaseMapMode } from "../../../store/useLayerVisibility";
import { INLINE_STYLE, SATELLITE_STYLE } from "../styles/inline";
import { buildSchemeStyle, SCHEME_STYLE_FALLBACK } from "../styles/scheme";
import { buildHybridStyle, HYBRID_STYLE_FALLBACK } from "../styles/hybrid";

export function useBaseMap(
  mapRef: React.MutableRefObject<Map | null>,
  onAfterApply: (mode: BaseMapMode) => void,
) {
  const baseMap = useLayerVisibility((s) => s.baseMap);
  const applied = useRef<BaseMapMode>("osm"); // INLINE_STYLE — 'osm'-эквивалент

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (applied.current === baseMap) return;

    let cancelled = false;
    let fired = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const apply = (style: StyleSpecification) => {
      if (cancelled) return;
      m.setStyle(style, { diff: false });
      applied.current = baseMap;

      const fireOnce = () => {
        if (cancelled || fired) return;
        fired = true;
        if (fallbackTimer) clearTimeout(fallbackTimer);
        onAfterApply(baseMap);
      };

      const poll = () => {
        if (cancelled || fired) return;
        if (m.isStyleLoaded()) {
          fireOnce();
        } else {
          requestAnimationFrame(poll);
        }
      };
      requestAnimationFrame(poll);

      // Hard timeout: на flaky-CDN basemap-style может не дойти до
      // isStyleLoaded() в разумный срок. После 5с считаем «и так сойдёт» —
      // карта уже отрисовала старый стиль; re-add layers лучше с задержкой,
      // чем не сделать вообще (вечный RAF-poll крутится, батарея садится).
      fallbackTimer = setTimeout(fireOnce, 5000);
    };

    if (baseMap === "scheme") {
      buildSchemeStyle().then(apply).catch(() => apply(SCHEME_STYLE_FALLBACK));
    } else if (baseMap === "hybrid") {
      buildHybridStyle().then(apply).catch(() => apply(HYBRID_STYLE_FALLBACK));
    } else {
      apply(baseMap === "satellite" ? SATELLITE_STYLE : INLINE_STYLE);
    }

    return () => {
      cancelled = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [baseMap, mapRef, onAfterApply]);
}
