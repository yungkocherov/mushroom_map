import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { palette, fontSize, spacing, radius } from "@mushroom-map/tokens/native";
import { useSpots } from "../../stores/useSpots";
import { useUserLocation } from "../../stores/useUserLocation";
import { tagIcon, tagLabel } from "@mushroom-map/types";
import type { LocalSpot } from "../../services/spotsRepo";

const RATING_DOT: Record<number, string> = {
  1: palette.light.danger,
  2: palette.light.caution,
  3: palette.light.inkDim,
  4: palette.light.moss,
  5: palette.light.forest,
};

type SortMode = "distance" | "date";

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
  return tags.map(tagLabel).slice(0, 3).join(" · ");
}

type SpotWithDistance = LocalSpot & { distanceMeters: number | null };

export default function SpotsScreen() {
  const router = useRouter();
  const spots = useSpots((s) => s.spots);
  const loaded = useSpots((s) => s.loaded);
  const load = useSpots((s) => s.load);
  const fix = useUserLocation((s) => s.fix);

  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>("distance");

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  // Уникальные tag-slug'и из текущих спотов — чипы строятся только из них,
  // чтоб не показывать пустые «нет спотов с этим тегом» фильтры.
  const availableTags = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const s of spots) for (const t of s.tags) set.add(t);
    return Array.from(set).sort((a, b) => tagLabel(a).localeCompare(tagLabel(b), "ru"));
  }, [spots]);

  const filtered = useMemo<SpotWithDistance[]>(() => {
    const q = query.trim().toLowerCase();
    const tagFilter = activeTags;

    const out: SpotWithDistance[] = [];
    for (const s of spots) {
      if (q.length > 0) {
        const hay = `${s.name ?? ""} ${s.note ?? ""}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      if (tagFilter.size > 0) {
        let allIn = true;
        for (const t of tagFilter) {
          if (!s.tags.includes(t)) { allIn = false; break; }
        }
        if (!allIn) continue;
      }
      out.push({
        ...s,
        distanceMeters: fix
          ? haversineMeters(fix.lat, fix.lon, s.lat, s.lon)
          : null,
      });
    }

    if (sortMode === "distance") {
      out.sort((a, b) => {
        if (a.distanceMeters == null && b.distanceMeters == null) {
          return b.created_at - a.created_at;
        }
        if (a.distanceMeters == null) return 1;
        if (b.distanceMeters == null) return -1;
        return a.distanceMeters - b.distanceMeters;
      });
    } else {
      out.sort((a, b) => b.created_at - a.created_at);
    }
    return out;
  }, [spots, query, activeTags, sortMode, fix?.lat, fix?.lon]);

  const toggleTag = (slug: string) => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const clearFilters = () => {
    setQuery("");
    setActiveTags(new Set());
  };

  const hasFilters = query.length > 0 || activeTags.size > 0;

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

      <View style={styles.searchRow}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Поиск по названию или заметке"
          placeholderTextColor={palette.light.inkDim}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {hasFilters ? (
          <Pressable onPress={clearFilters} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>Сброс</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.sortRow}>
        <Pressable
          style={[styles.sortChip, sortMode === "distance" && styles.sortChipActive]}
          onPress={() => setSortMode("distance")}
        >
          <Text style={[styles.sortChipText, sortMode === "distance" && styles.sortChipTextActive]}>
            По расстоянию
          </Text>
        </Pressable>
        <Pressable
          style={[styles.sortChip, sortMode === "date" && styles.sortChipActive]}
          onPress={() => setSortMode("date")}
        >
          <Text style={[styles.sortChipText, sortMode === "date" && styles.sortChipTextActive]}>
            По дате
          </Text>
        </Pressable>
      </View>

      {availableTags.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tagsScroll}
          contentContainerStyle={styles.tagsRow}
        >
          {availableTags.map((slug) => {
            const active = activeTags.has(slug);
            return (
              <Pressable
                key={slug}
                style={[styles.tagChip, active && styles.tagChipActive]}
                onPress={() => toggleTag(slug)}
              >
                <Text style={[styles.tagChipText, active && styles.tagChipTextActive]}>
                  {tagIcon(slug)} {tagLabel(slug)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <Text style={styles.countLine}>
        {hasFilters
          ? `Найдено: ${filtered.length} из ${spots.length}`
          : `Всего: ${spots.length}`}
      </Text>

      <FlatList
        data={filtered}
        keyExtractor={(s) => s.client_uuid}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        keyboardShouldPersistTaps="handled"
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
              {hasFilters
                ? "Под фильтр ничего не попадает. Сбрось фильтры или измени запрос."
                : "Спотов пока нет. Тапни оранжевую кнопку на карте чтобы сохранить место."}
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
    paddingBottom: spacing[2],
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[5],
    gap: spacing[2],
  },
  search: {
    flex: 1,
    fontSize: fontSize.body,
    color: palette.light.ink,
    backgroundColor: palette.light.paperRise,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  clearBtn: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
  },
  clearBtnText: {
    fontSize: fontSize.sm,
    color: palette.light.chanterelle,
  },
  sortRow: {
    flexDirection: "row",
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    gap: spacing[2],
  },
  sortChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.light.rule,
    backgroundColor: palette.light.paper,
  },
  sortChipActive: {
    borderColor: palette.light.forest,
    backgroundColor: palette.light.forest,
  },
  sortChipText: {
    fontSize: fontSize.sm,
    color: palette.light.ink,
  },
  sortChipTextActive: {
    color: palette.light.paper,
  },
  tagsScroll: {
    flexGrow: 0,
    paddingTop: spacing[2],
  },
  tagsRow: {
    paddingHorizontal: spacing[5],
    gap: spacing[2],
    flexDirection: "row",
  },
  tagChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.light.rule,
    backgroundColor: palette.light.paper,
  },
  tagChipActive: {
    borderColor: palette.light.chanterelle,
    backgroundColor: palette.light.chanterelle,
  },
  tagChipText: {
    fontSize: fontSize.sm,
    color: palette.light.ink,
  },
  tagChipTextActive: {
    color: palette.light.paper,
  },
  countLine: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
    fontSize: fontSize.xs,
    color: palette.light.inkDim,
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
