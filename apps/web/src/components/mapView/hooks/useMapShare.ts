/**
 * useMapShare — копирует URL текущего вида карты в clipboard и пускает
 * тост через store.shareToast.
 *
 * V4.2: clipboard fallback на execCommand.
 * V4.4: в URL теперь укладываются не только lat/lon/z, но и состояние
 * слоёв (visible-keys CSV), forestColorMode (fcm), baseMap (bm),
 * legendFilter (lf). Открытие ссылки восстанавливает тот же вид — раньше
 * показывалась только координата+zoom, слои оставались дефолтные.
 *
 * Сериализация коротких ключей:
 *   ?lat=..&lon=..&z=..&layers=forest,water&bm=hybrid&fcm=bonitet&lf=1,2,3
 *
 * `layers` — comma-separated layer-keys из visible (только true).
 * `bm` — basemap (scheme/satellite/hybrid/osm).
 * `fcm` — forest color mode (species/bonitet/age_group).
 * `lf` — legend filter values: для species это slug'и, для bonitet —
 *        числа, для age_group — строки. На consume-стороне восстанавливаем
 *        нужный тип по сопровождающему fcm.
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

    // Снимаем актуальное состояние store напрямую (не через subscribe —
    // чтобы share-callback всегда читал свежие значения).
    const s = useLayerVisibility.getState();
    const visibleKeys = Object.entries(s.visible)
      .filter(([, v]) => v)
      .map(([k]) => k);

    const url = new URL(window.location.href);
    url.searchParams.set("lat", lat.toFixed(5));
    url.searchParams.set("lon", lng.toFixed(5));
    url.searchParams.set("z", String(z));

    if (visibleKeys.length > 0) url.searchParams.set("layers", visibleKeys.join(","));
    else url.searchParams.delete("layers");

    if (s.baseMap !== "scheme") url.searchParams.set("bm", s.baseMap);
    else url.searchParams.delete("bm");

    if (s.forestColorMode !== "species") url.searchParams.set("fcm", s.forestColorMode);
    else url.searchParams.delete("fcm");

    if (s.legendFilter && s.legendFilter.length > 0) {
      url.searchParams.set("lf", s.legendFilter.map(String).join(","));
    } else {
      url.searchParams.delete("lf");
    }

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
