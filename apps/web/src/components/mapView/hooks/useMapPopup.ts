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

/**
 * MapLibre popup позиционируется через `transform: translate(-50%, -100%) translate(Xpx, Ypx)`.
 * Целочисленная часть `translate(Xpx, Ypx)` округлена (`subpixelPositioning: false` по дефолту),
 * но `translate(-50%, ...)` — это процент от ширины самого попапа. Если ширина контента
 * нечётная, `-50%` = пол-пикселя → Chrome на Windows растеризует текст на composited layer
 * с sub-pixel offset → видимый блёр. Yandex Browser рендерит иначе (нет блёра).
 * Фиксим, форсируя чётную ширину контейнера, тогда -50% всегда integer-px.
 */
function snapPopupWidthEven(el: HTMLElement): void {
  const content = el.querySelector<HTMLElement>(".maplibregl-popup-content");
  if (!content) return;
  const w = content.offsetWidth;
  if (w > 0 && w % 2 !== 0) content.style.width = `${w + 1}px`;
}

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
        if (el) {
          attachPopupHandlers(el);
          snapPopupWidthEven(el);
        }
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
