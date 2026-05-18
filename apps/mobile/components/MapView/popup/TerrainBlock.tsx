import { StyleSheet, Text } from "react-native";
import { palette, fontSize, spacing } from "@mushroom-map/tokens/native";
import type { TerrainAtResponse } from "@mushroom-map/types";

// Purely presentational: props in, JSX out. No fetch / state / effects.
// slope / aspect intentionally omitted here — mirrors the web popup,
// which surfaces only elevation in this compact block.

export function TerrainBlock({ terrain }: { terrain: TerrainAtResponse }) {
  if (terrain.elevation_m == null) return null;
  return (
    <Text style={styles.line}>
      {`Высота: ${Math.round(terrain.elevation_m)} м`}
    </Text>
  );
}

const styles = StyleSheet.create({
  line: {
    marginTop: spacing[5],
    color: palette.light.inkDim,
    fontSize: fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
});
