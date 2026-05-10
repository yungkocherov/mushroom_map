/**
 * LandingMapCameo — миниатюрная неинтерактивная превью-карта на лендинге.
 *
 * Использует тот же стек что и /map: scheme-basemap (Versatiles Colorful)
 * + forest.pmtiles слой в режиме «Породы». Раньше был OSM-raster без
 * forest'а — лендинг показывал просто карту мира, не отражая суть проекта.
 *
 *  - bbox привязан к ЛО (Финский залив + Ладога), zoom фиксирован
 *  - все интеракции отключены (drag, scroll-zoom, double-click, touch)
 *  - клик по контейнеру → navigate to /map
 *  - если scheme-style не догрузился — fallback на ESRI Topo (в нём тоже
 *    можно показать forest-overlay)
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildSchemeStyle, SCHEME_STYLE_FALLBACK } from "./mapView/styles/scheme";
import { addForestLayer, setForestVisibility } from "./mapView/layers/forest";
import styles from "./LandingMapCameo.module.css";

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

    let cancelled = false;
    const init = async () => {
      let style: maplibregl.StyleSpecification;
      try {
        style = await buildSchemeStyle();
      } catch {
        style = SCHEME_STYLE_FALLBACK;
      }
      if (cancelled || !containerRef.current) return;

      const m = new maplibregl.Map({
        container: containerRef.current,
        style,
        center: [30.3, 60.05],
        zoom: 7.6,
        attributionControl: false,
        interactive: false,
        maxTileCacheSize: 200,
      });
      mapRef.current = m;

      const addForest = () => {
        if (!m.isStyleLoaded()) {
          m.once("idle", addForest);
          return;
        }
        addForestLayer(m);
        setForestVisibility(m, true);
      };
      m.on("load", addForest);
    };
    void init();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
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
