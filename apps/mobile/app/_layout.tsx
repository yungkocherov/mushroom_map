import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { startSyncListener, syncSpots } from "../services/sync";
import { useSpots } from "../stores/useSpots";

export default function RootLayout() {
  const loadSpots = useSpots((s) => s.load);

  useEffect(() => {
    void loadSpots();
    void syncSpots();
    const stop = startSyncListener();
    return stop;
  }, [loadSpots]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </GestureHandlerRootView>
  );
}
