/**
 * useMapShare — копирует URL текущего вида карты в clipboard и пускает
 * тост через store.shareToast.
 *
 * V4.2: добавили fallback на старый `document.execCommand("copy")` —
 * `navigator.clipboard.writeText` может молча упасть на insecure
 * context (http без localhost), private mode, или при отсутствии
 * permission. Раньше юзер видел silent no-op и думал что кнопка
 * битая.
 */
import { useCallback } from "react";
import type { Map } from "maplibre-gl";

import { useLayerVisibility } from "../../../store/useLayerVisibility";

async function copyToClipboard(text: string): Promise<boolean> {
  // 1. Modern Clipboard API — secure context only.
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall-through к execCommand
    }
  }
  // 2. Legacy execCommand fallback — работает в http и в старых браузерах.
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.setAttribute("readonly", "");
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function useMapShare(mapRef: React.MutableRefObject<Map | null>) {
  const setShareToast = useLayerVisibility((s) => s.setShareToast);
  const setErrorMsg = useLayerVisibility((s) => s.setErrorMsg);

  return useCallback(() => {
    const m = mapRef.current;
    if (!m) return;
    const { lat, lng } = m.getCenter();
    const z = Math.round(m.getZoom() * 10) / 10;
    const url = new URL(window.location.href);
    url.searchParams.set("lat", lat.toFixed(5));
    url.searchParams.set("lon", lng.toFixed(5));
    url.searchParams.set("z", String(z));
    const text = url.toString();

    void copyToClipboard(text).then((ok) => {
      if (ok) {
        setShareToast(true);
        setTimeout(() => setShareToast(false), 2000);
      } else {
        // Прямой open + prompt — final fallback. Не идеал, но юзер
        // видит ссылку и может скопировать руками.
        setErrorMsg("Не удалось скопировать. Скопируй сам из адресной строки.");
        setTimeout(() => setErrorMsg(null), 4500);
        try {
          window.prompt("Скопируй ссылку:", text);
        } catch {
          // prompt отключён CSP — забили
        }
      }
    });
  }, [mapRef, setShareToast, setErrorMsg]);
}
