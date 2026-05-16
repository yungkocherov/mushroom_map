/**
 * useMapPopup — клик по карте: фетчит forest/soil/water/terrain
 * параллельно, монтирует ForestPopup внутри MapLibre Popup через
 * createRoot. Дополнительно ставит маркер-пин в точке клика, который
 * сидит под попапом и снимается при close.
 *
 * Перешёл на React (с HTML-string buildPopupHtml) в редизайне 2026-05-15:
 *   - анимации требуют ref'ов и стейта (open-anim, save-state)
 *   - escape-санитайзинг больше не нужен — React сам экранирует
 *
 * Пропуск кликов: если target — внутри .maplibregl-popup (то есть юзер
 * кликает по самому попапу), пропускаем чтобы не пересоздавать.
 */
import { useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import maplibregl, { type Map } from "maplibre-gl";

import {
  fetchForestAt,
  fetchSoilAt,
  fetchWaterDistanceAt,
  fetchTerrainAt,
} from "@mushroom-map/api-client";
import type { UserSpot } from "@mushroom-map/types";
import { ForestPopup } from "../ForestPopup";
import { PulsePin } from "../../PulsePin";
import { sharpenPopup } from "../utils/sharpenPopup";

const NEAR_SPOT_THRESHOLD_DEG = 0.0001; // ~11 m at the equator, ~6 m at 60°N

function isNearExistingSpot(
  lat: number,
  lon: number,
  spots: UserSpot[] | null,
): boolean {
  if (!spots) return false;
  return spots.some(
    (s) =>
      Math.abs(s.lat - lat) < NEAR_SPOT_THRESHOLD_DEG &&
      Math.abs(s.lon - lon) < NEAR_SPOT_THRESHOLD_DEG,
  );
}

export function useMapPopup(
  mapRef: React.MutableRefObject<Map | null>,
  spotsRef: React.MutableRefObject<UserSpot[] | null>,
) {
  // Активный popup + его React root + marker. Один за раз — клик
  // в другую точку убивает прежний.
  const activeRef = useRef<{
    popup: maplibregl.Popup;
    root: Root;
    marker: maplibregl.Marker;
  } | null>(null);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const teardown = () => {
      const cur = activeRef.current;
      if (!cur) return;
      // Defer unmount — иначе React предупреждает «unmount inside event».
      const root = cur.root;
      setTimeout(() => root.unmount(), 0);
      cur.marker.remove();
      activeRef.current = null;
    };

    const handler = async (e: maplibregl.MapMouseEvent) => {
      if (!e.lngLat) return;
      const target = e.originalEvent.target as HTMLElement | null;
      if (target?.closest(".maplibregl-popup")) return;
      // Click on a saved spot pin — игнорируем (его обрабатывает userSpots layer).
      // На будущее: если нужен click→edit-флоу для своего spot'а, его прицепим
      // через `m.on('click', 'user-spots', ...)`.

      const { lng, lat } = e.lngLat;

      // Снимаем предыдущий popup + marker
      teardown();

      const popupMaxWidth =
        window.innerWidth < 600 ? `${window.innerWidth - 32}px` : "340px";

      // Контейнер для React-контента. closeButton:false — рисуем свой ×.
      const container = document.createElement("div");
      container.style.pointerEvents = "auto";

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        maxWidth: popupMaxWidth,
        // НЕ фиксируем anchor — MapLibre сам выберет сторону так чтобы
        // попап не вылезал за край контейнера, и перевернёт его при
        // pan'е карты (точка у верхнего края → попап снизу, и т.д.).
        // Жёсткий anchor:"bottom" этот auto-flip ломал — попап улетал
        // за верх экрана. offset как число = радиальный отступ во все
        // стороны (18px на любом anchor'е, место под якорный пин).
        offset: 18,
        // CSS .popup-forest сбрасывает обёртку maplibregl-popup-content
        // (cream-bg/padding/shadow), потому что ForestPopup сам рисует
        // cream-карточку. Без этого видна padding-рамка вокруг карточки.
        className: "popup-forest",
      })
        .setLngLat([lng, lat])
        .setDOMContent(container)
        .addTo(m);
      sharpenPopup(popup);

      // Якорный пин под попапом — terra pulse через PulsePin.
      const pinEl = document.createElement("div");
      pinEl.style.pointerEvents = "none";
      const pinRoot = createRoot(pinEl);
      pinRoot.render(<PulsePin color="var(--chanterelle)" size={14} />);
      const marker = new maplibregl.Marker({ element: pinEl, anchor: "center" })
        .setLngLat([lng, lat])
        .addTo(m);

      // Loading state — простой placeholder без анимации (фетч обычно < 200ms).
      const root = createRoot(container);
      root.render(
        <div
          style={{
            padding: "16px 20px",
            background: "var(--cream)",
            borderRadius: 14,
            fontFamily: "var(--font-body)",
            color: "var(--ink-dim)",
            fontSize: 13,
            minWidth: 200,
            boxShadow: "0 22px 60px rgba(40,30,15,.28), 0 0 0 1px rgba(0,0,0,.06)",
          }}
        >
          Загружаю…
        </div>,
      );

      // Регистрируем активный
      activeRef.current = { popup, root, marker };

      // Кнопка-крестик в попапе вызывает popup.remove(); listen-on-close ниже
      // подберёт teardown.
      popup.on("close", () => {
        // pinRoot — отдельный root для маркера, тоже размонтируем.
        setTimeout(() => pinRoot.unmount(), 0);
        if (activeRef.current?.popup === popup) {
          // teardown уже мог быть вызван handler'ом для нового клика — guard.
          teardown();
        }
      });

      try {
        const [forest, soil, water, terrain] = await Promise.all([
          fetchForestAt(lat, lng),
          fetchSoilAt(lat, lng).catch(() => null),
          fetchWaterDistanceAt(lat, lng).catch(() => null),
          fetchTerrainAt(lat, lng).catch(() => null),
        ]);

        // Возможно, юзер кликнул ещё раз пока шёл fetch — наш popup закрыли.
        if (activeRef.current?.popup !== popup) return;

        const initiallySaved = isNearExistingSpot(lat, lng, spotsRef.current);

        root.render(
          <ForestPopup
            forest={forest}
            soil={soil}
            water={water}
            terrain={terrain}
            lat={lat}
            lon={lng}
            initiallySaved={initiallySaved}
            onClose={() => popup.remove()}
          />,
        );
      } catch {
        if (activeRef.current?.popup !== popup) return;
        root.render(
          <div
            style={{
              padding: "16px 20px",
              background: "var(--cream)",
              color: "var(--danger)",
              fontSize: 14,
              fontFamily: "var(--font-body)",
              borderRadius: 14,
            }}
          >
            Ошибка загрузки данных
          </div>,
        );
      }
    };

    m.on("click", handler);
    return () => {
      m.off("click", handler);
      teardown();
    };
  }, [mapRef, spotsRef]);
}
