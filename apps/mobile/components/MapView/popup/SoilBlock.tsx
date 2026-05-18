import { StyleSheet, Text, View } from "react-native";
import { palette, fontSize, spacing } from "@mushroom-map/tokens/native";
import type { SoilAtResponse } from "@mushroom-map/types";

// Purely presentational: props in, JSX out. No fetch / state / effects.

export function SoilBlock({ soil }: { soil: SoilAtResponse }) {
  const { polygon, profile_nearest } = soil;
  if (!polygon && !profile_nearest) return null;

  const accompanying = polygon
    ? [polygon.soil1, polygon.soil2, polygon.soil3]
        .filter((s): s is { id: number; descript: string } => Boolean(s))
        .map((s) => s.descript)
        .join(" + ")
    : "";

  return (
    <View style={styles.section}>
      {polygon ? (
        <>
          <Text style={styles.main}>{polygon.soil0.descript}</Text>
          {accompanying ? (
            <Text style={styles.accompanying}>{`+ ${accompanying}`}</Text>
          ) : null}
          {polygon.parent1?.name ? (
            <Text style={styles.line}>{`Порода: ${polygon.parent1.name}`}</Text>
          ) : null}
        </>
      ) : null}
      {profile_nearest ? (
        <Text style={styles.line}>
          {`pH ${profile_nearest.ph_h2o?.toFixed(1) ?? "—"} · Cорг ${
            profile_nearest.corg?.toFixed(1) ?? "—"
          }% · разрез ${profile_nearest.distance_km.toFixed(0)} км`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing[5],
    gap: spacing[1],
  },
  main: {
    color: palette.light.ink,
    fontSize: fontSize.sm,
  },
  accompanying: {
    color: palette.light.inkDim,
    fontSize: fontSize.sm,
  },
  line: {
    color: palette.light.inkDim,
    fontSize: fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
});
