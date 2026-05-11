/**
 * useToastLifecycles — управляет жизненным циклом fading-тостов:
 * - forestHint: показывается при первом успешном loaded.forest=true, 4с visible + 0.8с fade
 */
import { useEffect, useRef } from "react";
import { useLayerVisibility } from "../../../store/useLayerVisibility";

export function useToastLifecycles() {
  const forestLoaded = useLayerVisibility((s) => s.loaded.forest);
  const setForestHint = useLayerVisibility((s) => s.setForestHint);

  // Forest hint на rising-edge loaded.forest. 4с visible → 0.8с fade → hidden.
  const forestPrevLoadedRef = useRef(false);
  useEffect(() => {
    if (!forestLoaded || forestPrevLoadedRef.current) return;
    forestPrevLoadedRef.current = true;
    setForestHint("visible");
    const tFade = setTimeout(() => setForestHint("fading"), 4000);
    const tHide = setTimeout(() => setForestHint("hidden"), 4800);
    return () => {
      clearTimeout(tFade);
      clearTimeout(tHide);
    };
  }, [forestLoaded, setForestHint]);
}
