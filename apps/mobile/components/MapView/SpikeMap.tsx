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

import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { palette, fontSize, spacing, radius } from "@mushroom-map/tokens/native";
import { useUserLocation } from "../../stores/useUserLocation";
import { useOfflineRegions } from "../../stores/useOfflineRegions";
import { useNetwork } from "../../stores/useNetwork";
import {
  startLocationWatch,
  stopLocationWatch,
} from "../../services/location";
import { getLayerLocalUri } from "../../services/regions";
import { getApiBaseUrl } from "../../services/api";
import { ensureGlyphsExtracted, glyphsUrlPattern } from "../../services/glyphs";
import {
  buildMapStyle,
  type BaseMapMode,
  type ForestColorMode,
  type ForestSource,
  type OverlayKey,
} from "./style";
import { ForestPopup, type ForestFeatureProps } from "./ForestPopup";
import { Legend } from "./Legend";
import { LayerSheet } from "./LayerSheet";
import { SearchOverlay } from "./SearchOverlay";
import { SpotsLayer } from "./SpotsLayer";
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

const BASEMAP_OPTIONS: Array<{ id: BaseMapMode; label: string }> = [
  { id: "scheme",    label: "Схема" },
  { id: "satellite", label: "Спутник" },
  { id: "hybrid",    label: "Гибрид" },
];

function tilesStatusLabel(
  sources: ForestSource[],
  downloadedCount: number,
  online: boolean,
): string {
  if (sources.length === 0) {
    return online ? "—" : "offline · нет региона";
  }
  if (downloadedCount > 0) return `${sources.length} регионов`;
  if (online) return "online";
  return "—";
}

export function SpikeMap() {
  const [basemapUri, setBasemapUri] = useState<string | null>(null);
  const [glyphsBaseUri, setGlyphsBaseUri] = useState<string | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [popupFeature, setPopupFeature] = useState<ForestFeatureProps | null>(null);
  const [saveSpotOpen, setSaveSpotOpen] = useState(false);
  const [saveSpotCoords, setSaveSpotCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [baseMap, setBaseMap] = useState<BaseMapMode>("scheme");
  const [statusExpanded, setStatusExpanded] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [layerSheetOpen, setLayerSheetOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [forestColorMode, setForestColorMode] = useState<ForestColorMode>("species");
  const [overlays, setOverlays] = useState<Partial<Record<OverlayKey, boolean>>>({});

  const toggleOverlay = (k: OverlayKey, v: boolean) =>
    setOverlays((prev) => ({ ...prev, [k]: v }));
  const cameraRef = useRef<CameraRef>(null);
  const mapRef = useRef<MapViewRef>(null);

  const fix = useUserLocation((s) => s.fix);
  const followMode = useUserLocation((s) => s.followMode);
  const setFollowMode = useUserLocation((s) => s.setFollowMode);
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

  // Bundled glyphs extract — копирует 18 PBF в documentDirectory при первом
  // запуске (~1.8 МБ, idempotent). После копирования style получает
  // file:// URL и symbol-слои рендерятся offline.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const base = await ensureGlyphsExtracted();
        if (!cancelled) setGlyphsBaseUri(base);
      } catch {
        // online fallback остаётся — карта работает
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

  // Приоритет источников forest-выделов: скачанные районы → online через
  // api.geobiom.ru. Offline без скачанных регионов → лес не показывается.
  const sources = useMemo<ForestSource[]>(() => {
    if (downloaded.size > 0) {
      return Array.from(downloaded).map((slug) => ({
        id: `forest-${slug}`,
        pmtilesFileUri: getLayerLocalUri(slug, "forest"),
      }));
    }
    if (online) {
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

  const style = useMemo(
    () => buildMapStyle({
      forests: sources,
      basemapPmtilesUri: basemapUri,
      glyphsUrl: glyphsBaseUri ? glyphsUrlPattern(glyphsBaseUri) : null,
      baseMap,
      forestColorMode,
      overlays,
      tilesBaseUrl: getApiBaseUrl() + "/tiles",
    }),
    [sources, basemapUri, glyphsBaseUri, baseMap, forestColorMode, overlays],
  );

  if (sources.length === 0 && !basemapUri && !assetError) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.light.chanterelle} />
        <Text style={styles.hint}>Готовлю карту…</Text>
      </View>
    );
  }

  const recenterToFix = () => {
    if (!fix || !cameraRef.current) return;
    setFollowMode(true);
    // Зум поднимаем до 15 — для лесного use-case'а это уже видно
    // выделы крупно. Анимация плавная (700мс).
    cameraRef.current.setCamera({
      centerCoordinate: [fix.lon, fix.lat],
      zoomLevel: 15,
      animationDuration: 700,
    });
  };

  return (
    <View style={styles.flex}>
      <MapView
        ref={mapRef}
        style={styles.flex}
        mapStyle={style as object}
        compassEnabled
        compassViewPosition={3}
        compassViewMargins={{ x: 16, y: 144 }}
        attributionEnabled={false}
        onLongPress={(feature) => {
          // Long-press где угодно на карте → открыть SaveSpotSheet с
          // координатами точки тапа (как «Save place» в Google Maps).
          // Это единственный способ сохранить спот: специальной
          // FAB-кнопки нет, чтоб не перегружать UI.
          const geom = feature.geometry as { coordinates?: [number, number] };
          const coords = geom?.coordinates;
          if (!coords) return;
          setSaveSpotCoords({ lon: coords[0], lat: coords[1] });
          setSaveSpotOpen(true);
        }}
        onRegionWillChange={() => {
          // Любой жест-навигация по карте — выключаем follow,
          // чтоб камера не перепрыгивала на текущий GPS-фикс.
          if (followMode) setFollowMode(false);
        }}
        onPress={async (feature) => {
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
        <SpotsLayer cameraRef={cameraRef} />
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

      {/* Подложка — chip-row top-left. */}
      <View style={styles.basemapPicker}>
        {BASEMAP_OPTIONS.map((o) => {
          const active = baseMap === o.id;
          return (
            <Pressable
              key={o.id}
              style={[styles.basemapChip, active && styles.basemapChipActive]}
              onPress={() => setBaseMap(o.id)}
            >
              <Text style={[styles.basemapChipText, active && styles.basemapChipTextActive]}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Status overlay top-right: collapsed = бэйдж «ГПС», expanded =
          панель с координатами/тайлами. Скрывается когда открыт
          SaveSpotSheet (чтобы не мешать форме). */}
      {!saveSpotOpen ? (
        <Pressable
          style={[styles.statusOverlay, statusExpanded && styles.statusOverlayExpanded]}
          onPress={() => setStatusExpanded((v) => !v)}
        >
          {statusExpanded ? (
            <>
              <Text style={styles.statusText}>
                {permission === "granted"
                  ? "ГПС: ок"
                  : permission === "denied"
                    ? "ГПС не разрешён"
                    : "ГПС не запрошен"}
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
                тайлы: {tilesStatusLabel(sources, downloaded.size, online)}
              </Text>
              {error ? <Text style={styles.errorOverlay}>{error}</Text> : null}
              <Text style={styles.statusHint}>тап — свернуть</Text>
            </>
          ) : (
            <Text style={styles.statusBadgeText}>ГПС</Text>
          )}
        </Pressable>
      ) : null}

      {/* Кнопка «центрировать на мне» в стиле Google Maps —
          круглая иконка-цель. Активна только если есть GPS-фикс
          и не открыт SaveSpotSheet. Цвет иконки меняется при
          включённом follow-mode. */}
      {fix && !saveSpotOpen ? (
        <Pressable
          style={styles.gpsCircleBtn}
          onPress={recenterToFix}
          accessibilityLabel="Центрировать на моём положении"
        >
          <MaterialIcons
            name={followMode ? "my-location" : "near-me"}
            size={22}
            color={followMode ? palette.light.chanterelle : palette.light.ink}
          />
        </Pressable>
      ) : null}

      {!saveSpotOpen ? (
        <View style={styles.bottomLeftBtns}>
          <Pressable
            style={[styles.pillBtn, styles.iconPill]}
            onPress={() => setSearchOpen(true)}
            accessibilityLabel="Поиск"
          >
            <Ionicons name="search" size={20} color={palette.light.ink} />
          </Pressable>
          <Pressable style={styles.pillBtn} onPress={() => setLayerSheetOpen(true)}>
            <Text style={styles.pillBtnText}>Слои</Text>
          </Pressable>
          <Pressable style={styles.pillBtn} onPress={() => setLegendOpen(true)}>
            <Text style={styles.pillBtnText}>Легенда</Text>
          </Pressable>
        </View>
      ) : null}

      <Legend
        visible={legendOpen}
        onClose={() => setLegendOpen(false)}
        mode={forestColorMode}
      />

      <LayerSheet
        visible={layerSheetOpen}
        onClose={() => setLayerSheetOpen(false)}
        forestColorMode={forestColorMode}
        onForestColorModeChange={setForestColorMode}
        overlays={overlays}
        onToggleOverlay={toggleOverlay}
      />

      <SearchOverlay
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        onPickPlace={(lat, lon) => {
          setFollowMode(false);
          cameraRef.current?.setCamera({
            centerCoordinate: [lon, lat],
            zoomLevel: 12,
            animationDuration: 600,
          });
        }}
      />
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
  hint: {
    color: palette.light.inkDim,
    fontSize: fontSize.sm,
    textAlign: "center",
  },
  basemapPicker: {
    position: "absolute",
    top: spacing[5],
    left: spacing[4],
    flexDirection: "row",
    gap: spacing[1],
    backgroundColor: "rgba(245, 241, 230, 0.92)",
    borderRadius: radius.pill,
    padding: 3,
  },
  basemapChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1] + 2,
    borderRadius: radius.pill,
  },
  basemapChipActive: {
    backgroundColor: palette.light.forest,
  },
  basemapChipText: {
    fontSize: fontSize.xs,
    color: palette.light.ink,
  },
  basemapChipTextActive: {
    color: palette.light.paper,
    fontWeight: "600",
  },
  statusOverlay: {
    position: "absolute",
    top: spacing[5],
    right: spacing[4],
    backgroundColor: "rgba(245, 241, 230, 0.92)",
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.md,
    minWidth: 64,
    alignItems: "flex-end",
  },
  statusOverlayExpanded: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    minWidth: 200,
    alignItems: "flex-start",
  },
  statusBadgeText: {
    color: palette.light.ink,
    fontSize: fontSize.xs,
    fontVariant: ["tabular-nums"],
  },
  statusText: {
    color: palette.light.ink,
    fontSize: fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  statusHint: {
    color: palette.light.inkDim,
    fontSize: fontSize.xs,
    marginTop: spacing[1],
  },
  errorOverlay: {
    color: palette.light.danger,
    fontSize: fontSize.sm,
    marginTop: spacing[2],
  },
  // Круглая Google-Maps-style кнопка центрирования (40x40), всегда
  // одна позиция (bottom-right), цвет иконки меняется по followMode.
  gpsCircleBtn: {
    position: "absolute",
    right: spacing[4],
    bottom: spacing[5],
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.light.paper,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.light.rule,
    shadowColor: palette.light.ink,
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  bottomLeftBtns: {
    position: "absolute",
    left: spacing[4],
    bottom: spacing[5],
    flexDirection: "row",
    gap: spacing[2],
  },
  pillBtn: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.pill,
    backgroundColor: "rgba(245, 241, 230, 0.95)",
    borderWidth: 1,
    borderColor: palette.light.rule,
  },
  // Icon-only pill: квадратнее (44×40 примерно), без horizontal-padding.
  iconPill: {
    width: 40,
    height: 40,
    paddingHorizontal: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  pillBtnText: {
    color: palette.light.ink,
    fontSize: fontSize.sm,
  },
});
