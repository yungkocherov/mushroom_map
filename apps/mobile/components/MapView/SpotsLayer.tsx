import { useMemo, useEffect } from "react";
import {
  ShapeSource,
  CircleLayer,
  SymbolLayer,
  type OnPressEvent,
  type CameraRef,
} from "@maplibre/maplibre-react-native";
import { useRouter } from "expo-router";

import { palette } from "@mushroom-map/tokens/native";
import { useSpots } from "../../stores/useSpots";

/**
 * Слой пользовательских spots на карте + native MapLibre clustering.
 *
 * Кластеризация — встроена в MapLibre source (cluster=true), считается
 * на нативе при перерисовке. На отдалённом zoom'е точки сливаются в
 * круги с числом, на приближении — индивидуальные точки с цветом по
 * rating.
 *
 * Tap-handling:
 *   - cluster → zoom в кластер (cluster_id + getClusterExpansionZoom).
 *   - точка → spot/[uuid].
 *
 * Цвет точки определяется rating (через style expression). Без emoji
 * на маркере — это перегружает рендер на высокой плотности; emoji
 * остаётся только в карточке detail и в /spots списке.
 */

const SOURCE_ID = "user-spots";
const POINTS_LAYER = "user-spots-points";
const CLUSTERS_LAYER = "user-spots-clusters";
const CLUSTERS_COUNT_LAYER = "user-spots-clusters-count";

type Props = {
  /** Camera ref для zoom-in при тапе по cluster. */
  cameraRef: React.RefObject<CameraRef | null>;
};

export function SpotsLayer({ cameraRef }: Props) {
  const router = useRouter();
  const spots = useSpots((s) => s.spots);
  const loaded = useSpots((s) => s.loaded);
  const load = useSpots((s) => s.load);

  // Лениво подгружаем спиcок при первом mount'е карты — на /spots tab'е
  // тоже грузится, но карта может оказаться первым экраном.
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const fc = useMemo(() => {
    const features = spots
      .filter((s) => s.deleted_at == null)
      .map((s) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [s.lon, s.lat] },
        properties: {
          uuid: s.client_uuid,
          rating: s.rating ?? 3,
        },
      }));
    return { type: "FeatureCollection" as const, features };
  }, [spots]);

  if (fc.features.length === 0) return null;

  const handlePress = async (e: OnPressEvent) => {
    const f = e.features?.[0];
    if (!f) return;
    const props = (f.properties ?? {}) as {
      cluster?: boolean;
      cluster_id?: number;
      uuid?: string;
    };

    if (props.cluster && cameraRef.current && f.geometry?.type === "Point") {
      // Zoom-in на cluster: фиксированный z=13 — обычно достаточно
      // чтобы кластер раскрылся в индивидуальные точки (clusterMaxZoomLevel=12).
      const pos = (f.geometry as { coordinates: number[] }).coordinates;
      if (pos.length >= 2) {
        cameraRef.current.setCamera({
          centerCoordinate: [pos[0], pos[1]],
          zoomLevel: 13,
          animationDuration: 400,
        });
      }
      return;
    }

    if (props.uuid) {
      router.push({
        pathname: "/spot/[uuid]",
        params: { uuid: props.uuid },
      } as never);
    }
  };

  return (
    <ShapeSource
      id={SOURCE_ID}
      shape={fc}
      cluster
      clusterRadius={50}
      clusterMaxZoomLevel={12}
      onPress={handlePress}
    >
      {/* Кружок-cluster (>= 2 точек). Размер растёт от point_count. */}
      <CircleLayer
        id={CLUSTERS_LAYER}
        filter={["has", "point_count"]}
        style={{
          circleColor: [
            "step",
            ["get", "point_count"],
            palette.light.chanterelle,
            10,
            palette.light.forest,
            50,
            palette.light.ink,
          ],
          circleRadius: [
            "step",
            ["get", "point_count"],
            14,
            10,
            18,
            50,
            22,
          ],
          circleStrokeColor: palette.light.paper,
          circleStrokeWidth: 2,
          circleOpacity: 0.9,
        }}
      />

      {/* Цифра внутри cluster'а. */}
      <SymbolLayer
        id={CLUSTERS_COUNT_LAYER}
        filter={["has", "point_count"]}
        style={{
          textField: ["get", "point_count_abbreviated"],
          textSize: 13,
          textColor: palette.light.paper,
          textFont: ["Noto Sans Bold"],
          textHaloColor: "rgba(0,0,0,0.25)",
          textHaloWidth: 0.5,
        }}
      />

      {/* Индивидуальные точки (без cluster'а). Цвет по rating. */}
      <CircleLayer
        id={POINTS_LAYER}
        filter={["!", ["has", "point_count"]]}
        style={{
          circleRadius: 7,
          circleColor: [
            "match",
            ["get", "rating"],
            1, palette.light.danger,
            2, palette.light.caution,
            3, palette.light.inkDim,
            4, palette.light.moss,
            5, palette.light.forest,
            palette.light.inkDim,
          ],
          circleStrokeColor: palette.light.paper,
          circleStrokeWidth: 2,
        }}
      />
    </ShapeSource>
  );
}
