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
      // Re-apply current visibility — the layer may have just been added
      // via deferred m.once("idle", ...), in which case effect 2 already
      // ran and bailed out (no layer). Read latest store state.
      const wantVisible = useLayerVisibility.getState().visible.userSpots;
      if (m.getLayer("user-spots")) {
        m.setLayoutProperty("user-spots", "visibility", wantVisible ? "visible" : "none");
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
