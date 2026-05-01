import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
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
import {
  startLocationWatch,
  stopLocationWatch,
} from "../../services/location";
import { buildSpikeStyle } from "./style";

const TEST_ASSET = require("../../assets/forest-luzhsky.pmtiles");
const LUZHSKY_CENTER: [number, number] = [29.85, 58.74];

export function SpikeMap() {
  const [pmtilesUri, setPmtilesUri] = useState<string | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const cameraRef = useRef<CameraRef>(null);

  const fix = useUserLocation((s) => s.fix);
  const followMode = useUserLocation((s) => s.followMode);
  const permission = useUserLocation((s) => s.permission);
  const error = useUserLocation((s) => s.error);

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
        setPmtilesUri(asset.localUri);
      } catch (err) {
        setAssetError(err instanceof Error ? err.message : "asset-error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const style = useMemo(
    () => (pmtilesUri ? buildSpikeStyle(pmtilesUri) : null),
    [pmtilesUri],
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
});
