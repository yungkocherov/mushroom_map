/**
 * useUserSpotsSync — приватный layer пользователя. Не в LAYER_REGISTRY,
 * потому что управляется data-driven (props.userSpots: UserSpot[] | null),
 * а не toggle-driven.
 *
 * Поведение:
 *   null или [] → удалить layer и source
 *   ≥1 spot → если уже есть, updateUserSpots; иначе addUserSpotsLayer
 *
 * Видимость регулируется отдельно через useLayerVisibility.visible.userSpots
 * (LayerGrid чип «Сохранённые»).
 */
import { useEffect } from "react";
import type { Map } from "maplibre-gl";
import type { UserSpot } from "@mushroom-map/types";

import {
  addUserSpotsLayer,
  removeUserSpotsLayer,
  updateUserSpots,
} from "../layers/userSpots";
import { useLayerVisibility } from "../../../store/useLayerVisibility";

export function useUserSpotsSync(
  mapRef: React.MutableRefObject<Map | null>,
  spots: UserSpot[] | null,
) {
  const visible = useLayerVisibility((s) => s.visible.userSpots);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const apply = () => {
      if (!spots || spots.length === 0) {
        removeUserSpotsLayer(m);
        return;
      }
      if (m.getLayer("user-spots")) {
        updateUserSpots(m, spots);
      } else {
        addUserSpotsLayer(m, spots);
      }
    };
    if (m.isStyleLoaded()) apply();
    else m.once("idle", apply);
  }, [spots, mapRef]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !m.getLayer("user-spots")) return;
    m.setLayoutProperty("user-spots", "visibility", visible ? "visible" : "none");
  }, [visible, mapRef]);
}
