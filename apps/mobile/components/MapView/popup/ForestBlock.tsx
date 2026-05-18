import { StyleSheet, Text, View } from "react-native";
import { palette, fontSize, spacing, radius } from "@mushroom-map/tokens/native";
import type { ForestInfo } from "@mushroom-map/types";
import { forestName, bonitetLabel, areaHa } from "./format";

// Purely presentational: props in, JSX out. No fetch / state / effects.

export function ForestBlock({ forest }: { forest: ForestInfo }) {
  const bonitet = bonitetLabel(forest.bonitet);
  const area = areaHa(forest.area_m2);

  return (
    <View>
      <Text style={styles.title}>{forestName(forest.dominant_species)}</Text>
      <View style={styles.kvBlock}>
        {forest.age_group ? (
          <KV label="возраст" value={forest.age_group} />
        ) : null}
        {bonitet ? <KV label="бонитет" value={bonitet} /> : null}
        {area ? <KV label="площадь" value={area} /> : null}
        {forest.source ? <KV label="источник" value={forest.source} /> : null}
      </View>
    </View>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: fontSize.h2,
    color: palette.light.ink,
    marginBottom: spacing[4],
  },
  kvBlock: {
    backgroundColor: palette.light.paperRise,
    padding: spacing[4],
    borderRadius: radius.md,
    gap: spacing[2],
  },
  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  kvLabel: {
    color: palette.light.inkDim,
    fontSize: fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  kvValue: {
    color: palette.light.ink,
    fontSize: fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
});
