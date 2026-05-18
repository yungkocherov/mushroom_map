import { Fragment } from "react";
import { StyleSheet, Text, View } from "react-native";
import { palette, fontSize, spacing } from "@mushroom-map/tokens/native";
import type { SpeciesRef } from "@mushroom-map/types";
import { edibilityColor, affinityPct, MONTH_SHORT, currentMonth } from "./format";

// Purely presentational: props in, JSX out. No fetch / state / effects.
// v1 deliberate choice: web links each species to /species/:slug; mobile
// keeps the name as inert text (no in-popup navigation yet).

export function SpeciesList({ species }: { species: SpeciesRef[] }) {
  const month = currentMonth();
  return (
    <View style={styles.section}>
      {species.slice(0, 12).map((s) => {
        const pct = affinityPct(s.affinity);
        return (
          <View key={s.slug} style={styles.row}>
            <View style={styles.head}>
              <Text
                style={[styles.name, { color: edibilityColor(s.edibility) }]}
              >
                {s.name_ru}
              </Text>
              {pct ? <Text style={styles.affinity}>{pct}</Text> : null}
            </View>
            {s.season_months && s.season_months.length > 0 ? (
              <Text style={styles.season}>
                {s.season_months.map((m, i) => (
                  <Fragment key={m}>
                    {i > 0 ? <Text style={styles.seasonSep}> </Text> : null}
                    <Text
                      style={m === month ? styles.monthCur : styles.month}
                    >
                      {MONTH_SHORT[m] ?? ""}
                    </Text>
                  </Fragment>
                ))}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing[5],
  },
  row: {
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: palette.light.rule,
    gap: spacing[1],
  },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing[3],
  },
  name: {
    flex: 1,
    fontSize: fontSize.sm,
  },
  affinity: {
    color: palette.light.chanterelle,
    fontSize: fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  season: {
    color: palette.light.inkDim,
    fontSize: fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  seasonSep: {
    color: palette.light.inkDim,
    fontSize: fontSize.sm,
  },
  month: {
    color: palette.light.inkDim,
    fontSize: fontSize.sm,
  },
  monthCur: {
    color: palette.light.ink,
    fontSize: fontSize.sm,
    fontWeight: "700",
  },
});
