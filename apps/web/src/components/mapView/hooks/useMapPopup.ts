/**
 * useMapPopup — регистрирует click-handler на карте, рендерит MapLibre Popup
 * с loading-состоянием, фетчит forest/soil/water/terrain параллельно, рендерит
 * результат через buildPopupHtml.
 *
 * Пропуск: клики по самому попапу (.maplibregl-popup) — иначе re-trigger при
 * клике на ссылку внутри попапа.
 */
import { useEffect } from "react";
import maplibregl, { type Map } from "maplibre-gl";

import {
  fetchForestAt,
  fetchSoilAt,
  fetchWaterDistanceAt,
  fetchTerrainAt,
} from "@mushroom-map/api-client";
import { buildPopupHtml, attachPopupHandlers } from "../utils/popup";

export function useMapPopup(mapRef: React.MutableRefObject<Map | null>) {
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const handler = async (e: maplibregl.MapMouseEvent) => {
      if (!e.lngLat) return;
      if ((e.originalEvent.target as HTMLElement | null)?.closest(".maplibregl-popup")) return;
      const { lng, lat } = e.lngLat;

      const popupMaxWidth =
        window.innerWidth < 600 ? `${window.innerWidth - 32}px` : "380px";
      const popup = new maplibregl.Popup({ maxWidth: popupMaxWidth })
        .setLngLat([lng, lat])
        .setHTML(`<div style="font-family:sans-serif;color:#555;padding:4px">Загружаю…</div>`)
        .addTo(m);

      try {
        const [forest, soil, water, terrain] = await Promise.all([
          fetchForestAt(lat, lng),
          fetchSoilAt(lat, lng).catch(() => null),
          fetchWaterDistanceAt(lat, lng).catch(() => null),
          fetchTerrainAt(lat, lng).catch(() => null),
        ]);
        popup.setHTML(buildPopupHtml(forest, soil, water, terrain, lat, lng));
        const el = popup.getElement();
        if (el) attachPopupHandlers(el);
      } catch {
        popup.setHTML(`<div style="color:#c62828;font-size:12px">Ошибка загрузки данных</div>`);
      }
    };

    m.on("click", handler);
    return () => {
      m.off("click", handler);
    };
  }, [mapRef]);
}
