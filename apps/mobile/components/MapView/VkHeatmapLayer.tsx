import { useEffect, useState } from "react";
import { ShapeSource, HeatmapLayer } from "@maplibre/maplibre-react-native";
import { getApiBaseUrl } from "../../services/api";

/**
 * Heatmap-слой на основе district-aggregated VK-постов с фото грибов.
 * Endpoint: GET /api/mobile/vk/heatmap → 18 точек (centroid каждого
 * района ЛО) + weight = количество классифицированных постов.
 *
 * Online-only: при отсутствии сети просто скрывается (значит fetch
 * падает → state остаётся пустым). Это приемлемо: heatmap — экспло-
 * раторная фича, не критичная для основного offline-сценария.
 *
 * MapLibre `heatmap` тип: радиус и интенсивность экспрессно зависят
 * от zoom — на отдалении (z<8) сливается в общий тепловой контур,
 * вблизи (z>10) распадается на отдельные центры. Веса нормируются
 * по max_weight на сервере (передаётся отдельным полем).
 */

type HeatmapPoint = {
  lat: number;
  lon: number;
  weight: number;
  name: string;
};

type Response = {
  points: HeatmapPoint[];
  max_weight: number;
};

type Props = {
  visible: boolean;
};

export function VkHeatmapLayer({ visible }: Props) {
  const [data, setData] = useState<Response | null>(null);

  useEffect(() => {
    if (!visible) return;
    if (data) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${getApiBaseUrl()}/api/mobile/vk/heatmap`);
        if (!r.ok) return;
        const json = (await r.json()) as Response;
        if (!cancelled) setData(json);
      } catch {
        // network error — molchnym off; пользователь увидит просто
        // отсутствие слоя. Никакого toast'а — heatmap опциональна.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, data]);

  if (!visible || !data || data.points.length === 0) return null;

  const features = data.points.map((p) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
    properties: { weight: p.weight, name: p.name },
  }));
  const fc = { type: "FeatureCollection" as const, features };

  const maxW = Math.max(1, data.max_weight);

  return (
    <ShapeSource id="vk-heatmap-src" shape={fc}>
      <HeatmapLayer
        id="vk-heatmap"
        sourceID="vk-heatmap-src"
        style={{
          // Нормализуем weight в [0..1] — interpolate по полю properties.weight.
          heatmapWeight: [
            "interpolate",
            ["linear"],
            ["get", "weight"],
            0,
            0,
            maxW,
            1,
          ],
          // Интенсивность глобальная: на низких зумах суммарный нагрев
          // ниже (точки сливаются), на высоких — каждая точка ярче.
          heatmapIntensity: [
            "interpolate",
            ["linear"],
            ["zoom"],
            5,
            0.5,
            10,
            2.5,
          ],
          // Радиус в пикселях. С зумом растёт — иначе на z=10 точки
          // выглядят как мелкие пятнышки.
          heatmapRadius: [
            "interpolate",
            ["linear"],
            ["zoom"],
            5,
            20,
            10,
            60,
            13,
            120,
          ],
          // Прозрачность снижается на больших зумах (больше деталей
          // карты под heatmap'ом — не должна перекрывать).
          heatmapOpacity: [
            "interpolate",
            ["linear"],
            ["zoom"],
            5,
            0.7,
            12,
            0.4,
          ],
          // Стандартный цветовой ramp синий → зелёный → жёлтый → оранж → красный.
          heatmapColor: [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(0, 0, 0, 0)",
            0.2,
            "rgba(70, 130, 180, 0.5)",
            0.4,
            "rgba(95, 180, 110, 0.7)",
            0.6,
            "rgba(240, 200, 80, 0.8)",
            0.8,
            "rgba(230, 130, 60, 0.85)",
            1,
            "rgba(200, 50, 40, 0.9)",
          ],
        }}
      />
    </ShapeSource>
  );
}
