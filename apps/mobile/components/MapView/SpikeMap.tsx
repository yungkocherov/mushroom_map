import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Asset } from "expo-asset";
import {
  MapView,
  type MapViewRef,
  Camera,
  type CameraRef,
  ShapeSource,
  CircleLayer,
  UserLocation,
} from "@maplibre/maplibre-react-native";

import { palette, fontSize, spacing } from "@mushroom-map/tokens/native";
import { useUserLocation } from "../../stores/useUserLocation";
import { useOfflineRegions } from "../../stores/useOfflineRegions";
import { useNetwork } from "../../stores/useNetwork";
import {
  startLocationWatch,
  stopLocationWatch,
} from "../../services/location";
import { getLayerLocalUri } from "../../services/regions";
import { getApiBaseUrl } from "../../services/api";
import { buildMapStyle, type ForestSource } from "./style";
import { ForestPopup, type ForestFeatureProps } from "./ForestPopup";
import { SaveSpotSheet } from "../SaveSpotSheet";

// basemap-lo-low.pmtiles генерится `pipelines/build_basemap.py`. Если
// отсутствует на момент билда — require() падает, поэтому try/optional.
let BASEMAP_ASSET: number | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  BASEMAP_ASSET = require("../../assets/basemap-lo-low.pmtiles");
} catch {
  BASEMAP_ASSET = null;
}
const LUZHSKY_CENTER: [number, number] = [29.85, 58.74];

function tilesStatusLabel(
  sources: ForestSource[],
  downloadedCount: number,
  online: boolean,
): string {
  if (sources.length === 0) {
    return online ? "—" : "offline · нет региона";
  }
  if (downloadedCount > 0) return `${sources.length} regions`;
  if (online) return "online";
  return "—";
}

export function SpikeMap() {
  const [basemapUri, setBasemapUri] = useState<string | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [popupFeature, setPopupFeature] = useState<ForestFeatureProps | null>(null);
  const [saveSpotOpen, setSaveSpotOpen] = useState(false);
  const [saveSpotCoords, setSaveSpotCoords] = useState<{ lat: number; lon: number } | null>(null);
  const cameraRef = useRef<CameraRef>(null);
  const mapRef = useRef<MapViewRef>(null);

  const fix = useUserLocation((s) => s.fix);
  const followMode = useUserLocation((s) => s.followMode);
  const permission = useUserLocation((s) => s.permission);
  const error = useUserLocation((s) => s.error);
  const downloaded = useOfflineRegions((s) => s.downloaded);
  const refreshRegions = useOfflineRegions((s) => s.refresh);
  const online = useNetwork((s) => s.online);

  useEffect(() => {
    if (BASEMAP_ASSET == null) return;
    let cancelled = false;
    (async () => {
      try {
        const basemap = Asset.fromModule(BASEMAP_ASSET);
        await basemap.downloadAsync();
        if (!cancelled && basemap.localUri) {
          setBasemapUri(basemap.localUri);
        }
      } catch (err) {
        // Базмап-ассет опционален — без него остаётся paper-фон, не
        // блокируем карту. Логируем но не падаем.
        setAssetError(err instanceof Error ? err.message : "basemap-asset-error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void refreshRegions();
  }, [refreshRegions]);

  useEffect(() => {
    void startLocationWatch();
    return () => stopLocationWatch();
  }, []);

  useEffect(() => {
    if (!followMode || !fix || !cameraRef.current) return;
    cameraRef.current.setCamera({
      centerCoordinate: [fix.lon, fix.lat],
      animationDuration: 600,
    });
  }, [followMode, fix?.lat, fix?.lon]);

  // Приоритет источников forest-выделов:
  //   1. Скачанные районы (per-district) — самое быстрое, работает offline
  //   2. Online + не скачано → remote forest.pmtiles + forest_lo через
  //      HTTP Range (как на сайте; нативный pmtiles plugin умеет https://)
  //   3. Offline без скачанных районов → лес не показывается. Onboarding
  //      forces скачать минимум один регион при первом старте, так что
  //      в нормальном flow эта ветка не достигается. Если юзер всё-таки
  //      окажется тут — увидит paper-фон + basemap, статус «нет региона».
  const sources = useMemo<ForestSource[]>(() => {
    if (downloaded.size > 0) {
      return Array.from(downloaded).map((slug) => ({
        id: `forest-${slug}`,
        pmtilesFileUri: getLayerLocalUri(slug, "forest"),
      }));
    }
    if (online) {
      // Online mode: hard cutoff на z=9. forest_lo для z=5-8 (aggregated),
      // forest для z>=9 (per-vydel detail). minzoom/maxzoom выставляются
      // в style.ts builder'е — никакого overlap'а на boundary.
      return [
        {
          id: "forest-remote-lo",
          pmtilesFileUri: `${getApiBaseUrl()}/tiles/forest_lo.pmtiles`,
          sourceLayer: "forest_lo",
        },
        {
          id: "forest-remote",
          pmtilesFileUri: `${getApiBaseUrl()}/tiles/forest.pmtiles`,
        },
      ];
    }
    return [];
  }, [downloaded, online]);

  // Style рисуется всегда — даже при пустых sources даёт paper-фон, чтоб
  // не блокировать UI «вечным спиннером» если basemap-asset медленно
  // распаковывается на холодном старте.
  const style = useMemo(
    () => buildMapStyle({ forests: sources, basemapPmtilesUri: basemapUri }),
    [sources, basemapUri],
  );

  // basemap-asset ещё может распаковываться при первом запуске — показываем
  // короткий спиннер пока ни sources, ни basemap не готовы. После первого
  // distill'а basemapUri / любая загруженная region разблокируют карту.
  if (sources.length === 0 && !basemapUri && !assetError) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.light.chanterelle} />
        <Text style={styles.hint}>Готовлю карту…</Text>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <MapView
        ref={mapRef}
        style={styles.flex}
        mapStyle={style as object}
        compassEnabled
        attributionEnabled={false}
        onLongPress={(feature) => {
          // Long-press где угодно на карте → открыть SaveSpotSheet с
          // координатами точки тапа (как «Save place» в Google Maps).
          const geom = feature.geometry as { coordinates?: [number, number] };
          const coords = geom?.coordinates;
          if (!coords) return;
          setSaveSpotCoords({ lon: coords[0], lat: coords[1] });
          setSaveSpotOpen(true);
        }}
        onPress={async (feature) => {
          // MapView.onPress даёт точку тапа но БЕЗ properties с layer'а.
          // Нужно явно queryRenderedFeaturesAtPoint по forest-fill ID'ам.
          // properties.{screenPointX, screenPointY} — pixel-координаты для query.
          const sx = (feature.properties as { screenPointX?: number })?.screenPointX;
          const sy = (feature.properties as { screenPointY?: number })?.screenPointY;
          if (sx == null || sy == null || !mapRef.current) return;
          const layerIds = sources.flatMap((s) => [`${s.id}-fill`, `${s.id}-lo-fill`]);
          try {
            const fc = await mapRef.current.queryRenderedFeaturesAtPoint(
              [sx, sy],
              undefined,
              layerIds,
            );
            const hit = fc?.features?.find(
              (f) => typeof (f.properties as { dominant_species?: unknown })?.dominant_species === "string",
            );
            if (hit?.properties) setPopupFeature(hit.properties as ForestFeatureProps);
          } catch {
            // ignore — query может фейлить пока стиль ещё не готов
          }
        }}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: LUZHSKY_CENTER,
            zoomLevel: 10,
          }}
        />
        <UserLocation
          visible
          showsUserHeadingIndicator
          androidRenderMode="compass"
        />
        {fix ? (
          <ShapeSource
            id="user-fix"
            shape={{
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [fix.lon, fix.lat],
              },
              properties: {},
            }}
          >
            <CircleLayer
              id="user-fix-dot"
              style={{
                circleRadius: 8,
                circleColor: palette.light.chanterelle,
                circleStrokeColor: palette.light.paper,
                circleStrokeWidth: 3,
              }}
            />
          </ShapeSource>
        ) : null}
      </MapView>

      <ForestPopup
        visible={popupFeature !== null}
        feature={popupFeature}
        onClose={() => setPopupFeature(null)}
      />

      <SaveSpotSheet
        visible={saveSpotOpen}
        coords={saveSpotCoords}
        onClose={() => {
          setSaveSpotOpen(false);
          setSaveSpotCoords(null);
        }}
      />

      <Pressable
        style={[
          styles.fab,
          !fix && styles.fabDisabled,
        ]}
        onPress={() => {
          if (!fix) return;
          setSaveSpotCoords(null); // FAB → SaveSpotSheet возьмёт GPS fix
          setSaveSpotOpen(true);
        }}
      >
        <Text style={styles.fabPlus}>+</Text>
      </Pressable>

      <View style={styles.statusOverlay} pointerEvents="none">
        <Text style={styles.statusText}>
          GPS: {permission === "granted" ? "✓" : permission}
        </Text>
        {fix ? (
          <Text style={styles.statusText}>
            {fix.lat.toFixed(5)}, {fix.lon.toFixed(5)} · ±
            {fix.accuracy != null ? Math.round(fix.accuracy) : "?"} м
          </Text>
        ) : (
          <Text style={styles.statusText}>ожидание фикса…</Text>
        )}
        <Text style={styles.statusText}>
          tiles: {tilesStatusLabel(sources, downloaded.size, online)}
        </Text>
        {error ? <Text style={styles.errorOverlay}>{error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.light.paper,
    padding: spacing[5],
  },
  error: {
    color: palette.light.danger,
    fontSize: fontSize.body,
    marginBottom: spacing[3],
    textAlign: "center",
  },
  hint: {
    color: palette.light.inkDim,
    fontSize: fontSize.sm,
    textAlign: "center",
  },
  statusOverlay: {
    position: "absolute",
    top: spacing[5],
    left: spacing[4],
    right: spacing[4],
    backgroundColor: "rgba(245, 241, 230, 0.9)",
    padding: spacing[3],
    borderRadius: 8,
  },
  statusText: {
    color: palette.light.ink,
    fontSize: fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  errorOverlay: {
    color: palette.light.danger,
    fontSize: fontSize.sm,
    marginTop: spacing[2],
  },
  fab: {
    position: "absolute",
    right: spacing[4],
    bottom: spacing[5],
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.light.chanterelle,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: palette.light.ink,
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 4,
  },
  fabDisabled: {
    opacity: 0.4,
  },
  fabPlus: {
    color: palette.light.paper,
    fontSize: 32,
    lineHeight: 36,
  },
});
