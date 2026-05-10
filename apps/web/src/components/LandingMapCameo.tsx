/**
 * LandingMapCameo — миниатюрная неинтерактивная превью-карта на лендинге.
 *
 * Использует тот же MapLibre+pmtiles стек что и /map, но:
 *  - bbox привязан к ЛО (Финский залив + Ладога), zoom фиксирован
 *  - все интеракции отключены (drag, scroll-zoom, double-click, touch)
 *  - клик по контейнеру → navigate to /map
 *  - не рендерит forest/water/oopt/etc. — только базовый schemе для
 *    превью; настоящая карта со слоями ждёт по адресу /map
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import { INLINE_STYLE } from "./mapView/styles/inline";
import styles from "./LandingMapCameo.module.css";

// Один протокол на приложение — повторное .addProtocol после mount
// /map тоже не вредит, но регистрируем здесь чтобы Landing мог
// быть первым потребителем.
const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile.bind(protocol));

type Props = {
  onClick?: () => void;
};

export function LandingMapCameo({ onClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const m = new maplibregl.Map({
      container: containerRef.current,
      style: INLINE_STYLE,
      center: [30.5, 60.0],
      zoom: 7.2,
      attributionControl: false,
      // Disable all interactions — cameo is decorative, click forwards
      // to /map.
      interactive: false,
      maxTileCacheSize: 200,
    });
    mapRef.current = m;

    return () => {
      m.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <button
      type="button"
      onClick={onClick}
      className={styles.cameo}
      aria-label="Открыть карту"
    >
      <div ref={containerRef} className={styles.mapEl} aria-hidden="true" />
      <span className={styles.openHint}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M7 17 17 7" />
          <path d="M7 7h10v10" />
        </svg>
        открыть карту
      </span>
    </button>
  );
}
