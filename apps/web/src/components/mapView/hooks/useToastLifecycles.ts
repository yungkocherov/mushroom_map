/**
 * useToastLifecycles — управляет жизненным циклом fading-тостов:
 * - vpnToast: показывается при переключении на satellite/hybrid, fade через 3.5с,
 *   полное скрытие через ещё 0.8с
 * - forestHint: показывается при первом успешном loaded.forest=true, тот же lifecycle
 */
import { useEffect, useRef } from "react";
import { useLayerVisibility } from "../../../store/useLayerVisibility";

export function useToastLifecycles() {
  const baseMap = useLayerVisibility((s) => s.baseMap);
  const vpnToast = useLayerVisibility((s) => s.vpnToast);
  const forestHint = useLayerVisibility((s) => s.forestHint);
  const forestLoaded = useLayerVisibility((s) => s.loaded.forest);
  const setVpnToast = useLayerVisibility((s) => s.setVpnToast);
  const setForestHint = useLayerVisibility((s) => s.setForestHint);

  // Trigger VPN toast when switching to satellite/hybrid
  useEffect(() => {
    if (baseMap === "satellite" || baseMap === "hybrid") {
      setVpnToast("visible");
      const t = setTimeout(() => setVpnToast("fading"), 3500);
      return () => clearTimeout(t);
    }
  }, [baseMap, setVpnToast]);

  // VPN toast fade-out
  useEffect(() => {
    if (vpnToast === "fading") {
      const t = setTimeout(() => setVpnToast("hidden"), 800);
      return () => clearTimeout(t);
    }
  }, [vpnToast, setVpnToast]);

  // Trigger forest hint on first successful load (rising-edge of loaded.forest)
  const forestPrevLoadedRef = useRef(false);
  useEffect(() => {
    if (forestLoaded && !forestPrevLoadedRef.current) {
      forestPrevLoadedRef.current = true;
      setForestHint("visible");
      const t = setTimeout(() => setForestHint("fading"), 4000);
      return () => clearTimeout(t);
    }
  }, [forestLoaded, setForestHint]);

  // Forest hint fade-out
  useEffect(() => {
    if (forestHint === "fading") {
      const t = setTimeout(() => setForestHint("hidden"), 800);
      return () => clearTimeout(t);
    }
  }, [forestHint, setForestHint]);
}
