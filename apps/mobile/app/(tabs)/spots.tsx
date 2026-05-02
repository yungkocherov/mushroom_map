import { useEffect, useMemo } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { palette, fontSize, spacing, radius } from "@mushroom-map/tokens/native";
import { useSpots } from "../../stores/useSpots";
import { useUserLocation } from "../../stores/useUserLocation";
import type { LocalSpot } from "../../services/spotsRepo";

const TAG_RU: Record<string, string> = {
  "boletus-edulis": "Белый",
  "leccinum-scabrum": "Подберёзовик",
  "leccinum-aurantiacum": "Подосиновик",
  "cantharellus-cibarius": "Лисичка",
  "imleria-badia": "Польский",
  "lactarius-deliciosus": "Рыжик",
  russula: "Сыроежка",
};

const RATING_DOT: Record<number, string> = {
  1: palette.light.danger,
  2: palette.light.caution,
  3: palette.light.inkDim,
  4: palette.light.moss,
  5: palette.light.forest,
};

/** Haversine в метрах между двумя WGS84 точками. */
function haversineMeters(
  lat1: number, lon1: number, lat2: number, lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} м`;
  if (meters < 10_000) return `${(meters / 1000).toFixed(1)} км`;
  return `${Math.round(meters / 1000)} км`;
}

function formatTagsLine(tags: string[]): string {
  if (tags.length === 0) return "";
  return tags.map((t) => TAG_RU[t] ?? t).slice(0, 3).join(" · ");
}

type SpotWithDistance = LocalSpot & { distanceMeters: number | null };

export default function SpotsScreen() {
  const router = useRouter();
  const spots = useSpots((s) => s.spots);
  const loaded = useSpots((s) => s.loaded);
  const load = useSpots((s) => s.load);
  const fix = useUserLocation((s) => s.fix);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const sorted = useMemo<SpotWithDistance[]>(() => {
    const out = spots.map((s) => ({
      ...s,
      distanceMeters: fix
        ? haversineMeters(fix.lat, fix.lon, s.lat, s.lon)
        : null,
    }));
    out.sort((a, b) => {
      if (a.distanceMeters == null && b.distanceMeters == null) {
        return b.created_at - a.created_at;
      }
      if (a.distanceMeters == null) return 1;
      if (b.distanceMeters == null) return -1;
      return a.distanceMeters - b.distanceMeters;
    });
    return out;
  }, [spots, fix?.lat, fix?.lon]);

  const renderItem = ({ item }: { item: SpotWithDistance }) => {
    const dotColor = RATING_DOT[item.rating ?? 3] ?? palette.light.inkDim;
    return (
      <Pressable
        style={({ pressed }) => [
          styles.row,
          pressed && { backgroundColor: palette.light.paperRise },
        ]}
        onPress={() =>
          router.push({
            pathname: "/spot/[uuid]",
            params: { uuid: item.client_uuid },
          } as never)
        }
      >
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <View style={styles.rowMain}>
          <Text style={styles.rowTitle}>
            {item.name?.trim() || "Без названия"}
          </Text>
          {item.tags.length > 0 ? (
            <Text style={styles.rowTags}>{formatTagsLine(item.tags)}</Text>
          ) : null}
          <Text style={styles.rowMeta}>
            {item.distanceMeters != null
              ? `${formatDistance(item.distanceMeters)} от тебя · `
              : "GPS не определён · "}
            {new Date(item.created_at).toLocaleDateString("ru-RU")}
            {item.sync_state !== "synced" ? "  ↻" : ""}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Споты</Text>
      <FlatList
        data={sorted}
        keyExtractor={(s) => s.client_uuid}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={load}
            tintColor={palette.light.chanterelle}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              Спотов пока нет. Тапни оранжевую кнопку на карте чтобы сохранить место.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.light.paper,
  },
  h1: {
    fontSize: fontSize.h1,
    color: palette.light.ink,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
    paddingBottom: spacing[3],
  },
  empty: {
    padding: spacing[6],
  },
  emptyText: {
    fontSize: fontSize.body,
    color: palette.light.inkDim,
    textAlign: "center",
    lineHeight: fontSize.body * 1.55,
  },
  row: {
    flexDirection: "row",
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[5],
    gap: spacing[3],
    alignItems: "center",
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  rowMain: {
    flex: 1,
    flexDirection: "column",
    gap: spacing[1],
  },
  rowTitle: {
    fontSize: fontSize.body,
    color: palette.light.ink,
  },
  rowTags: {
    fontSize: fontSize.sm,
    color: palette.light.forest,
  },
  rowMeta: {
    fontSize: fontSize.xs,
    color: palette.light.inkDim,
    fontVariant: ["tabular-nums"],
  },
  sep: {
    height: 1,
    backgroundColor: palette.light.rule,
    marginHorizontal: spacing[5],
  },
});
