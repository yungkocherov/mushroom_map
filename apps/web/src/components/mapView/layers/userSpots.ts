/**
 * Слой «мои сохранённые места» — точки из /api/cabinet/spots с
 * маркером, цвет которого производный от spot.rating (1=красное → 5=зелёное),
 * кликом → попап с name/note.
 *
 * Источник — GeoJSON в памяти, не pmtiles (данные приватные и
 * меняются часто). Обновление через `updateUserSpots(map, spots)`
 * вместо пересоздания layer'а.
 *
 * Layer-id: `user-spots`. Источник: `user-spots-src`.
 */

import maplibregl, { type Map } from "maplibre-gl";
import type { UserSpot } from "@mushroom-map/types";
import { findFirstSymbolLayerId } from "../utils/findSymbolLayer";
import { escapeHtml } from "../../../lib/escapeHtml";
import { RATING_HEX } from "../../../lib/spotRating";


function spotsToGeoJson(spots: UserSpot[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: spots.map((s) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.lon, s.lat] },
      properties: {
        id:     s.id,
        name:   s.name,
        note:   s.note,
        rating: s.rating,
      },
    })),
  };
}


export function addUserSpotsLayer(m: Map, spots: UserSpot[]): void {
  const data = spotsToGeoJson(spots);
  if (!m.getSource("user-spots-src")) {
    m.addSource("user-spots-src", { type: "geojson", data });
  } else {
    (m.getSource("user-spots-src") as maplibregl.GeoJSONSource).setData(data);
  }
  if (m.getLayer("user-spots")) return;

  // Поверх всех других слоёв, но под symbol-labels — в visibility выше
  // лесов / воды / т.п., но не закрывает топонимы.
  const beforeId = findFirstSymbolLayerId(m);
  m.addLayer(
    {
      id: "user-spots",
      type: "circle",
      source: "user-spots-src",
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          5,  3,
          12, 6,
          16, 9,
        ],
        "circle-color": [
          "match",
          ["get", "rating"],
          1, RATING_HEX[1],
          2, RATING_HEX[2],
          3, RATING_HEX[3],
          4, RATING_HEX[4],
          5, RATING_HEX[5],
          RATING_HEX[3],
        ],
        "circle-stroke-color":  "#ffffff",
        "circle-stroke-width":  2,
        "circle-opacity":       0.95,
      },
    },
    beforeId,
  );

  // Клик по точке — попап с name + note. Не используем общий
  // map-click handler, потому что он показывает forest-popup и
  // конфликтует. Здесь — конкретно по фиче.
  m.on("click", "user-spots", (e) => {
    const f = e.features?.[0];
    if (!f) return;
    const p = f.properties as { name: string; note: string };
    const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
    e.originalEvent.stopPropagation();

    const noteHtml = p.note
      ? `<div style="margin-top:4px;color:#555;font-size:11px;white-space:pre-wrap">${escapeHtml(p.note)}</div>`
      : "";
    new maplibregl.Popup({ maxWidth: "260px", closeButton: true })
      .setLngLat([lon, lat])
      .setHTML(`
        <div style="font-family:sans-serif;font-size:13px">
          <div style="font-weight:600;color:#2d5a3a">${escapeHtml(p.name)}</div>
          ${noteHtml}
          <div style="margin-top:6px;font-family:monospace;font-size:10px;color:#888">
            ${lat.toFixed(5)}, ${lon.toFixed(5)}
          </div>
        </div>`)
      .addTo(m);
  });

  // Курсор-pointer над точками — отдаёт сигнал «кликабельно».
  m.on("mouseenter", "user-spots", () => {
    m.getCanvas().style.cursor = "pointer";
  });
  m.on("mouseleave", "user-spots", () => {
    m.getCanvas().style.cursor = "";
  });
}


export function updateUserSpots(m: Map, spots: UserSpot[]): void {
  const src = m.getSource("user-spots-src") as maplibregl.GeoJSONSource | undefined;
  if (!src) {
    addUserSpotsLayer(m, spots);
    return;
  }
  src.setData(spotsToGeoJson(spots));
}


export function removeUserSpotsLayer(m: Map): void {
  if (m.getLayer("user-spots")) m.removeLayer("user-spots");
  if (m.getSource("user-spots-src")) m.removeSource("user-spots-src");
}
