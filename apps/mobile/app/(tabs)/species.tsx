import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { palette, fontSize, spacing, radius } from "@mushroom-map/tokens/native";
import {
  getCatalogList,
  type SpeciesEntry,
  type SpeciesEdibility,
} from "../../services/speciesCatalog";

const EDIBILITY_RU: Record<SpeciesEdibility, string> = {
  edible: "съедобный",
  edible_with_caveat: "условно",
  inedible: "несъедобный",
  poisonous: "ядовитый",
  deadly: "смертельный",
  unknown: "неизв.",
};

const EDIBILITY_COLOR: Record<SpeciesEdibility, string> = {
  edible: palette.light.forest,
  edible_with_caveat: palette.light.caution,
  inedible: palette.light.inkDim,
  poisonous: palette.light.danger,
  deadly: palette.light.danger,
  unknown: palette.light.inkDim,
};

const FILTERS: Array<{ id: "all" | SpeciesEdibility; label: string }> = [
  { id: "all", label: "Все" },
  { id: "edible", label: "Съедобные" },
  { id: "edible_with_caveat", label: "Условно" },
  { id: "poisonous", label: "Ядовитые" },
  { id: "deadly", label: "Смертельные" },
];

type Item = { slug: string } & SpeciesEntry;

function formatSeason(months: number[]): string {
  if (months.length === 0) return "—";
  const ru = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  const sorted = [...months].sort((a, b) => a - b);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (last - first === sorted.length - 1) {
    return `${ru[first - 1]}–${ru[last - 1]}`;
  }
  return sorted.map((m) => ru[m - 1]).join(", ");
}

export default function SpeciesScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState<"all" | SpeciesEdibility>("all");

  useEffect(() => {
    void getCatalogList().then(setItems);
  }, []);

  const filtered = useMemo(() => {
    const f = filter === "all" ? items : items.filter((i) => i.edibility === filter);
    return [...f].sort((a, b) => a.name_ru.localeCompare(b.name_ru, "ru"));
  }, [items, filter]);

  const renderItem = ({ item }: { item: Item }) => (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: palette.light.paperRise },
      ]}
      onPress={() =>
        router.push({
          pathname: "/species/[slug]",
          params: { slug: item.slug },
        } as never)
      }
    >
      <View
        style={[
          styles.dot,
          { backgroundColor: EDIBILITY_COLOR[item.edibility] },
        ]}
      />
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>{item.name_ru || item.slug}</Text>
        <Text style={styles.rowLat}>{item.name_lat}</Text>
        <Text style={styles.rowMeta}>
          {EDIBILITY_RU[item.edibility]} · {formatSeason(item.season_months)}
          {item.red_book ? " · красная книга" : ""}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Виды</Text>
      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.id}
            style={[
              styles.filterChip,
              filter === f.id && styles.filterChipActive,
            ]}
            onPress={() => setFilter(f.id)}
          >
            <Text
              style={[
                styles.filterChipText,
                filter === f.id && styles.filterChipTextActive,
              ]}
            >
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(i) => i.slug}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Нет видов под этот фильтр.
          </Text>
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
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[3],
  },
  filterChip: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.light.rule,
    backgroundColor: palette.light.paperRise,
  },
  filterChipActive: {
    backgroundColor: palette.light.ink,
    borderColor: palette.light.ink,
  },
  filterChipText: {
    color: palette.light.ink,
    fontSize: fontSize.sm,
  },
  filterChipTextActive: {
    color: palette.light.paper,
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
  },
  rowTitle: {
    fontSize: fontSize.body,
    color: palette.light.ink,
  },
  rowLat: {
    fontSize: fontSize.xs,
    color: palette.light.inkDim,
    fontStyle: "italic",
    marginTop: 2,
  },
  rowMeta: {
    fontSize: fontSize.xs,
    color: palette.light.inkDim,
    marginTop: spacing[1],
  },
  sep: {
    height: 1,
    backgroundColor: palette.light.rule,
    marginHorizontal: spacing[5],
  },
  empty: {
    padding: spacing[6],
    color: palette.light.inkDim,
    textAlign: "center",
    fontSize: fontSize.body,
  },
});
