import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { palette, fontSize, spacing, radius } from "@mushroom-map/tokens/native";
import {
  getCatalogList,
  type SpeciesEntry,
  type SpeciesEdibility,
} from "../../services/speciesCatalog";

const EDIBILITY_RU: Record<SpeciesEdibility, string> = {
  edible: "съедобный",
  edible_with_caveat: "условно-съедобный",
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

const FOREST_RU: Record<string, string> = {
  pine: "Сосновый",
  spruce: "Еловый",
  birch: "Берёзовый",
  aspen: "Осиновый",
  oak: "Дубовый",
  alder: "Ольховый",
  willow: "Ивовый",
  fir: "Пихтовый",
  larch: "Лиственничный",
  linden: "Липовый",
  maple: "Кленовый",
  ash: "Ясеневый",
  elm: "Вязовый",
  mixed: "Смешанный",
  mixed_coniferous: "Хвойно-смеш.",
  mixed_broadleaved: "Лиственно-смеш.",
  unknown: "Неопр.",
};

const MONTH_RU = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

export default function SpeciesDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [entry, setEntry] = useState<({ slug: string } & SpeciesEntry) | null>(null);

  useEffect(() => {
    void getCatalogList().then((list) => {
      setEntry(list.find((e) => e.slug === slug) ?? null);
    });
  }, [slug]);

  if (!entry) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: "Вид" }} />
        <Text style={styles.notFound}>Вид не найден</Text>
      </View>
    );
  }

  const seasonSet = new Set(entry.season_months);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: entry.name_ru || entry.slug,
          headerStyle: { backgroundColor: palette.light.paperRise },
          headerTintColor: palette.light.ink,
        }}
      />

      <View style={styles.header}>
        <View
          style={[
            styles.dot,
            { backgroundColor: EDIBILITY_COLOR[entry.edibility] },
          ]}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{entry.name_ru || entry.slug}</Text>
          <Text style={styles.lat}>{entry.name_lat}</Text>
        </View>
      </View>

      <Text
        style={[
          styles.edibility,
          { color: EDIBILITY_COLOR[entry.edibility] },
        ]}
      >
        {EDIBILITY_RU[entry.edibility]}
        {entry.red_book ? " · занесён в Красную книгу" : ""}
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Сезон</Text>
        <View style={styles.monthRow}>
          {MONTH_RU.map((m, i) => (
            <View
              key={m}
              style={[
                styles.monthCell,
                seasonSet.has(i + 1) && styles.monthCellActive,
              ]}
            >
              <Text
                style={[
                  styles.monthCellText,
                  seasonSet.has(i + 1) && styles.monthCellTextActive,
                ]}
              >
                {m}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {entry.forest_types.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Где растёт</Text>
          <View style={styles.tagsRow}>
            {entry.forest_types.map((ft) => (
              <View key={ft} style={styles.forestChip}>
                <Text style={styles.forestChipText}>
                  {FOREST_RU[ft] ?? ft}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Информация</Text>
        <Text style={styles.bodyText}>
          Полная карточка вида с описанием, фото и предупреждениями о двойниках —
          доступна на сайте geobiom.ru/species/{entry.slug}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.light.paper,
  },
  content: {
    padding: spacing[5],
    paddingBottom: spacing[7],
  },
  notFound: {
    padding: spacing[6],
    color: palette.light.inkDim,
    textAlign: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    marginBottom: spacing[4],
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  title: {
    fontSize: fontSize.h1,
    color: palette.light.ink,
  },
  lat: {
    fontSize: fontSize.sm,
    color: palette.light.inkDim,
    fontStyle: "italic",
  },
  edibility: {
    fontSize: fontSize.body,
    marginBottom: spacing[5],
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  section: {
    marginBottom: spacing[5],
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    color: palette.light.inkDim,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: spacing[3],
  },
  monthRow: {
    flexDirection: "row",
    gap: spacing[1],
  },
  monthCell: {
    flex: 1,
    paddingVertical: spacing[2],
    borderRadius: radius.sm,
    backgroundColor: palette.light.paperRise,
    alignItems: "center",
  },
  monthCellActive: {
    backgroundColor: palette.light.chanterelle,
  },
  monthCellText: {
    fontSize: fontSize.xs,
    color: palette.light.inkDim,
  },
  monthCellTextActive: {
    color: palette.light.paper,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
  },
  forestChip: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radius.pill,
    backgroundColor: palette.light.forest,
  },
  forestChipText: {
    color: palette.light.paper,
    fontSize: fontSize.sm,
  },
  bodyText: {
    fontSize: fontSize.body,
    color: palette.light.inkDim,
    lineHeight: fontSize.body * 1.55,
  },
});
