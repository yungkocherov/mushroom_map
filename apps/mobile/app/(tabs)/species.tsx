import { StyleSheet, Text, View } from "react-native";
import { palette, fontSize, spacing } from "@mushroom-map/tokens/native";

export default function SpeciesScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Виды</Text>
      <Text style={styles.hint}>
        Каталог 21 вида грибов и ягод из реестра проекта. Совместим с веб-каталогом
        geobiom.ru/species.
      </Text>
      <Text style={styles.todo}>Phase 4</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.light.paper,
    padding: spacing[5],
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: fontSize.h1,
    color: palette.light.ink,
    marginBottom: spacing[3],
  },
  hint: {
    fontSize: fontSize.body,
    color: palette.light.inkDim,
    textAlign: "center",
    lineHeight: fontSize.body * 1.55,
  },
  todo: {
    marginTop: spacing[5],
    fontSize: fontSize.xs,
    color: palette.light.chanterelle,
    letterSpacing: 1.5,
  },
});
