/**
 * useToastLifecycles — управляет жизненным циклом fading-тостов:
 * - vpnToast: показывается при переключении на satellite/hybrid, 2с visible + 0.8с fade
 * - forestHint: показывается при первом успешном loaded.forest=true, 4с visible + 0.8с fade
 *
 * Каждый тост — один useEffect с двумя setTimeout. Не делим lifecycle между
 * эффектами через store (раньше fade-эффект мог сбиться от посторонних
 * обновлений стора и тост висел вечно — см. user feedback 2026-04-29).
 */
import { useEffect, useRef } from "react";
import { useLayerVisibility } from "../../../store/useLayerVisibility";

export function useToastLifecycles() {
  const baseMap = useLayerVisibility((s) => s.baseMap);
  const forestLoaded = useLayerVisibility((s) => s.loaded.forest);
  const setVpnToast = useLayerVisibility((s) => s.setVpnToast);
  const setForestHint = useLayerVisibility((s) => s.setForestHint);

  // VPN toast: 2с visible → 0.8с fade → hidden. Все таймеры в одном эффекте,
  // чтобы перезапуск basemap'а атомарно сбрасывал старые таймеры.
  useEffect(() => {
    if (baseMap !== "satellite" && baseMap !== "hybrid") return;
    setVpnToast("visible");
    const tFade = setTimeout(() => setVpnToast("fading"), 2000);
    const tHide = setTimeout(() => setVpnToast("hidden"), 2800);
    return () => {
      clearTimeout(tFade);
      clearTimeout(tHide);
    };
  }, [baseMap, setVpnToast]);

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
