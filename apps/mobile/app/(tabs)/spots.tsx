import { StyleSheet, Text, View } from "react-native";
import { palette, fontSize, spacing } from "@mushroom-map/tokens/native";

export default function SpotsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Споты</Text>
      <Text style={styles.hint}>
        Здесь будет список твоих сохранённых грибных мест, отсортированный по
        расстоянию от текущего GPS. Локально, без сервера.
      </Text>
      <Text style={styles.todo}>Phase 3</Text>
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
