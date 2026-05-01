import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native";
import { palette } from "@mushroom-map/tokens/native";
import { SpikeMap } from "../../components/MapView/SpikeMap";

export default function MapScreen() {
  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <SpikeMap />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: palette.light.paper,
  },
});
