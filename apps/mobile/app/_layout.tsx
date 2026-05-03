import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { startSyncListener, syncSpots } from "../services/sync";
import { preloadCatalog } from "../services/speciesCatalog";
import { useSpots } from "../stores/useSpots";
import { useOnboarding } from "../stores/useOnboarding";
import { useNetwork } from "../stores/useNetwork";
import { View } from "react-native";
import { NetworkBanner } from "../components/NetworkBanner";

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const loadSpots = useSpots((s) => s.load);
  const onboardingCompleted = useOnboarding((s) => s.completed);
  const loadOnboarding = useOnboarding((s) => s.load);
  const initNetwork = useNetwork((s) => s.init);

  useEffect(() => {
    void preloadCatalog();
    void loadOnboarding();
    void loadSpots();
    void syncSpots();
    const stopSync = startSyncListener();
    const stopNet = initNetwork();
    return () => {
      stopSync();
      stopNet();
    };
  }, [loadSpots, loadOnboarding, initNetwork]);

  useEffect(() => {
    if (onboardingCompleted === null) return;
    const onOnboarding = (segments[0] as string) === "onboarding";
    if (!onboardingCompleted && !onOnboarding) {
      router.replace("/onboarding" as never);
    }
  }, [onboardingCompleted, segments, router]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <StatusBar style="dark" />
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="regions" options={{ headerShown: true }} />
            <Stack.Screen name="spot/[uuid]" options={{ headerShown: true }} />
            <Stack.Screen name="species/[slug]" options={{ headerShown: true }} />
          </Stack>
          <NetworkBanner />
        </View>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
