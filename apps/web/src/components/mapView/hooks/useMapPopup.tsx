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
    reanchor: (() => void) | null;
  } | null>(null);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const teardown = () => {
      const cur = activeRef.current;
      if (!cur) return;
      if (cur.reanchor) {
        m.off("move", cur.reanchor);
        m.off("zoom", cur.reanchor);
      }
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

      // ── Расчёт anchor СИНХРОННО из точки клика ──────────────────
      // MapLibre auto-anchor (когда options.anchor пуст) считается в
      // первом _update — синхронно внутри `.addTo(m)`, когда React-
      // контейнер ещё ПУСТ (render async) → offsetHeight≈0 → дефолт
      // 'bottom'. Реальный ~580px-попап у верха экрана вылезает за
      // кадр, а пересчёта на async-render MapLibre не делает.
      //
      // Поэтому считаем anchor САМИ из e.point (есть синхронно) +
      // оценочного размера попапа и передаём в options.anchor — тогда
      // MapLibre берёт его напрямую (минует свой broken auto-путь).
      // Точность по высоте не критична: решение top/bottom устойчиво
      // к ±100px. computeAnchor переиспользуется на map move/zoom для
      // переворота при pan'е к краю.
      const POPUP_W = 340;
      const POPUP_H_EST = 580;
      const computeAnchor = (
        px: number,
        py: number,
      ): maplibregl.PositionAnchor => {
        const cv = m.getCanvas();
        const mapW = cv.clientWidth;
        const mapH = cv.clientHeight;
        const PAD = 24;
        // anchor 'bottom' = попап НАД точкой (нужно POPUP_H места
        // сверху). 'top' = попап ПОД точкой.
        let v: "top" | "bottom";
        if (py >= POPUP_H_EST + PAD) v = "bottom";
        else if (mapH - py >= POPUP_H_EST + PAD) v = "top";
        else v = py > mapH - py ? "bottom" : "top";
        let h = "";
        if (px < POPUP_W / 2 + 12) h = "-left";
        else if (px > mapW - POPUP_W / 2 - 12) h = "-right";
        return `${v}${h}` as maplibregl.PositionAnchor;
      };
      const initialAnchor = computeAnchor(e.point.x, e.point.y);

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        maxWidth: popupMaxWidth,
        // Явный anchor из точки клика — корректная сторона СРАЗУ при
        // открытии (не дефолтный 'bottom' от пустого контейнера).
        // На pan'е пересчитывается в reanchor.
        anchor: initialAnchor,
        // offset число = радиальный отступ во все стороны (18px на
        // любом anchor'е, место под якорный пин).
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

      // Loading placeholder. ВАЖНО: размер ≈ реальному ForestPopup
      // (320×~560). MapLibre считает auto-anchor (сторона показа, чтобы
      // не вылезти за контейнер) в ПЕРВОМ _update — по текущему размеру
      // контента — и кэширует `_anchor`, больше не пересчитывает на
      // setLngLat. Если placeholder крошечный, anchor лочится по нему
      // (дефолт 'bottom') и реальный 580px-попап у верхнего края
      // вылезает за экран. Placeholder реального размера → MapLibre
      // сразу выбирает корректную сторону, и она остаётся валидной
      // когда контент подменяется.
      const root = createRoot(container);
      root.render(
        <div
          style={{
            width: 320,
            minHeight: 560,
            boxSizing: "border-box",
            padding: "20px",
            background: "var(--cream)",
            borderRadius: 14,
            fontFamily: "var(--font-body)",
            color: "var(--ink-dim)",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 22px 60px rgba(40,30,15,.28), 0 0 0 1px rgba(0,0,0,.06)",
          }}
        >
          Загружаю…
        </div>,
      );

      // ── Reanchor на pan/zoom ────────────────────────────────────
      // Открытие уже корректно (anchor из e.point в конструкторе).
      // На каждом map move/zoom пересчитываем сторону по ТЕКУЩЕЙ
      // проекции точки → попап «переворачивается» при подходе к краю
      // экрана. options.anchor выставлен явно, MapLibre берёт его в
      // _update напрямую (минует broken auto-путь).
      const reanchor = () => {
        if (activeRef.current?.popup !== popup) return;
        const ll = popup.getLngLat();
        if (!ll) return;
        const pt = m.project([ll.lng, ll.lat]);
        const anchor = computeAnchor(pt.x, pt.y);
        if (popup.options.anchor !== anchor) {
          popup.options.anchor = anchor;
          popup.setLngLat([ll.lng, ll.lat]);
        }
      };
      m.on("move", reanchor);
      m.on("zoom", reanchor);

      // Регистрируем активный
      activeRef.current = { popup, root, marker, reanchor };

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
        // Контент полноразмерный → пересчитать anchor. ResizeObserver
        // может промахнуться по timing'у (callback до layout commit'а),
        // поэтому двойной rAF — гарантированно после того как браузер
        // отрисовал ForestPopup и offsetHeight реальный.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (activeRef.current?.popup === popup) reanchor();
          }),
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
