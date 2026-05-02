import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Asset } from "expo-asset";
import {
  MapView,
  Camera,
  type CameraRef,
  ShapeSource,
  CircleLayer,
  UserLocation,
} from "@maplibre/maplibre-react-native";

import { palette, fontSize, spacing } from "@mushroom-map/tokens/native";
import { useUserLocation } from "../../stores/useUserLocation";
import { useOfflineRegions } from "../../stores/useOfflineRegions";
import {
  startLocationWatch,
  stopLocationWatch,
} from "../../services/location";
import { getLayerLocalUri } from "../../services/regions";
import { buildMapStyle, type ForestSource } from "./style";
import { ForestPopup, type ForestFeatureProps } from "./ForestPopup";
import { SaveSpotSheet } from "../SaveSpotSheet";

const TEST_ASSET = require("../../assets/forest-luzhsky.pmtiles");
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

export function SpikeMap() {
  const [bundledUri, setBundledUri] = useState<string | null>(null);
  const [basemapUri, setBasemapUri] = useState<string | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [popupFeature, setPopupFeature] = useState<ForestFeatureProps | null>(null);
  const [saveSpotOpen, setSaveSpotOpen] = useState(false);
  const cameraRef = useRef<CameraRef>(null);

  const fix = useUserLocation((s) => s.fix);
  const followMode = useUserLocation((s) => s.followMode);
  const permission = useUserLocation((s) => s.permission);
  const error = useUserLocation((s) => s.error);
  const downloaded = useOfflineRegions((s) => s.downloaded);
  const refreshRegions = useOfflineRegions((s) => s.refresh);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const asset = Asset.fromModule(TEST_ASSET);
        await asset.downloadAsync();
        if (cancelled) return;
        if (!asset.localUri) {
          setAssetError("PMTiles asset has no localUri after download");
          return;
        }
        // MapLibre Native PMTiles handler ждёт URL вида
        //   pmtiles://file:///data/user/0/<pkg>/cache/<asset>.pmtiles
        // — inner-URL обязан иметь file:// префикс. expo-asset.localUri
        // и так возвращает file:///..., поэтому prepend в style.ts.
        setBundledUri(asset.localUri);

        if (BASEMAP_ASSET != null) {
          const basemap = Asset.fromModule(BASEMAP_ASSET);
          await basemap.downloadAsync();
          if (!cancelled && basemap.localUri) {
            setBasemapUri(basemap.localUri);
          }
        }
      } catch (err) {
        setAssetError(err instanceof Error ? err.message : "asset-error");
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

  // Prefer downloaded regions; fallback на bundled placeholder если
  // юзер ничего не скачал (Phase 0 spike compatibility).
  const sources = useMemo<ForestSource[]>(() => {
    if (downloaded.size > 0) {
      return Array.from(downloaded).map((slug) => ({
        id: `forest-${slug}`,
        pmtilesFileUri: getLayerLocalUri(slug, "forest"),
      }));
    }
    if (bundledUri) {
      return [{ id: "forest", pmtilesFileUri: bundledUri }];
    }
    return [];
  }, [downloaded, bundledUri]);

  const style = useMemo(
    () => (sources.length > 0 || basemapUri
      ? buildMapStyle({ forests: sources, basemapPmtilesUri: basemapUri })
      : null),
    [sources, basemapUri],
  );

  if (assetError) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Tile asset error: {assetError}</Text>
        <Text style={styles.hint}>
          Положи forest-luzhsky.pmtiles в apps/mobile/assets/ перед запуском
          spike (см. README).
        </Text>
      </View>
    );
  }

  if (!style) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.light.chanterelle} />
        <Text style={styles.hint}>Распаковываю тайлы…</Text>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <MapView
        style={styles.flex}
        mapStyle={style as object}
        compassEnabled
        attributionEnabled={false}
        onPress={(feature) => {
          // Только forest features имеют dominant_species — отфильтровываем
          // background tap'ы и user-fix-dot.
          const props = (feature as { properties?: ForestFeatureProps })?.properties;
          if (props && typeof props.dominant_species === "string") {
            setPopupFeature(props);
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
        onClose={() => setSaveSpotOpen(false)}
      />

      <Pressable
        style={[
          styles.fab,
          !fix && styles.fabDisabled,
        ]}
        onPress={() => fix && setSaveSpotOpen(true)}
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
          tiles: {sources.length > 0 ? `${sources.length} ${downloaded.size > 0 ? "regions" : "(spike)"}` : "—"}
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
