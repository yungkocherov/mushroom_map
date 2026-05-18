import { StyleSheet, Text, View } from "react-native";
import { palette, fontSize, spacing } from "@mushroom-map/tokens/native";
import type { WaterDistanceResponse, WaterCandidate } from "@mushroom-map/types";
import { WATER_KIND_LABEL, fmtDistance } from "./format";

// Purely presentational: props in, JSX out. No fetch / state / effects.

function line(c: WaterCandidate): string {
  const label = WATER_KIND_LABEL[c.kind] ?? c.kind;
  const name = c.name ? ` ${c.name}` : "";
  return `${label}${name} — ${fmtDistance(c.distance_m)}`;
}

function sameAsNearest(
  c: WaterCandidate,
  nearest: WaterCandidate | null,
): boolean {
  if (!nearest) return false;
  return (
    c === nearest ||
    (c.kind === nearest.kind && c.distance_m === nearest.distance_m)
  );
}

export function WaterBlock({ water }: { water: WaterDistanceResponse }) {
  const { nearest } = water;
  const extras: WaterCandidate[] = [];
  for (const c of [water.by_source?.waterway, water.by_source?.wetland]) {
    if (c && !sameAsNearest(c, nearest)) extras.push(c);
  }

  if (!nearest && extras.length === 0) return null;

  return (
    <View style={styles.section}>
      {nearest ? <Text style={styles.line}>{line(nearest)}</Text> : null}
      {extras.map((c) => (
        <Text key={`${c.kind}-${c.distance_m}`} style={styles.lineDim}>
          {line(c)}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing[5],
    gap: spacing[1],
  },
  line: {
    color: palette.light.ink,
    fontSize: fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  lineDim: {
    color: palette.light.inkDim,
    fontSize: fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
});
