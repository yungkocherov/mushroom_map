import { useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import * as Location from "expo-location";
import { palette, fontSize, spacing, radius } from "@mushroom-map/tokens/native";
import { useOnboarding } from "../stores/useOnboarding";
import { useUserLocation } from "../stores/useUserLocation";
import { requestLocationPermission } from "../services/location";

const { width } = Dimensions.get("window");

type SlideId = "welcome" | "gps" | "regions";

const SLIDES: { id: SlideId; title: string; lead: string; cta: string }[] = [
  {
    id: "welcome",
    title: "Geobiom — лес Ленобласти",
    lead:
      "Карта лесных выделов с породами и возрастом. Сохрани грибной спот по GPS, открой его потом стрелкой-компасом. Всё работает без сети — заранее скачай нужные районы.",
    cta: "Дальше",
  },
  {
    id: "gps",
    title: "Доступ к GPS",
    lead:
      "Чтобы показать твою точку на лесной карте и расстояние до спотов, нужен доступ к местоположению. Используется только когда приложение открыто. Никаких данных в облако без логина.",
    cta: "Разрешить",
  },
  {
    id: "regions",
    title: "Скачай район",
    lead:
      "Чтобы карта работала в лесу без сети, скачай интересующие тебя районы. Можно прямо сейчас или потом из Settings → Регионы.",
    cta: "Открыть регионы",
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const markDone = useOnboarding((s) => s.markDone);
  const setPermission = useUserLocation((s) => s.setPermission);
  const [page, setPage] = useState(0);

  const goNext = async () => {
    const slide = SLIDES[page]!;
    if (slide.id === "gps") {
      const status = await requestLocationPermission();
      if (status !== "granted") {
        Alert.alert(
          "Permission",
          "GPS отключён. Можно включить позже через Settings → Apps → Geobiom → Permissions.",
        );
      }
      setPermission(status);
    }
    if (page === SLIDES.length - 1) {
      await markDone();
      router.replace("/(tabs)" as never);
      return;
    }
    setPage(page + 1);
  };

  const skip = async () => {
    await markDone();
    router.replace("/(tabs)" as never);
  };

  const slide = SLIDES[page]!;
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.dots}>
        {SLIDES.map((s, i) => (
          <View
            key={s.id}
            style={[
              styles.dot,
              i === page && styles.dotActive,
            ]}
          />
        ))}
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.lead}>{slide.lead}</Text>
      </View>

      <View style={styles.footer}>
        <Pressable style={styles.skipBtn} onPress={skip}>
          <Text style={styles.skipText}>Пропустить</Text>
        </Pressable>
        <Pressable style={styles.cta} onPress={goNext}>
          <Text style={styles.ctaText}>{slide.cta}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.light.paper,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[7],
    paddingBottom: spacing[5],
    justifyContent: "space-between",
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing[2],
    paddingTop: spacing[3],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.light.rule,
  },
  dotActive: {
    backgroundColor: palette.light.chanterelle,
    width: 24,
  },
  body: {
    flex: 1,
    justifyContent: "center",
  },
  title: {
    fontSize: fontSize.display,
    color: palette.light.ink,
    marginBottom: spacing[4],
    lineHeight: fontSize.display * 1.2,
  },
  lead: {
    fontSize: fontSize.body,
    color: palette.light.inkDim,
    lineHeight: fontSize.body * 1.6,
  },
  footer: {
    flexDirection: "row",
    gap: spacing[3],
  },
  skipBtn: {
    flex: 1,
    paddingVertical: spacing[3],
    alignItems: "center",
    justifyContent: "center",
  },
  skipText: {
    color: palette.light.inkDim,
    fontSize: fontSize.body,
  },
  cta: {
    flex: 2,
    backgroundColor: palette.light.chanterelle,
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    alignItems: "center",
  },
  ctaText: {
    color: palette.light.paper,
    fontSize: fontSize.body,
  },
});
