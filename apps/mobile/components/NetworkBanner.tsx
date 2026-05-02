import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { palette, fontSize, spacing } from "@mushroom-map/tokens/native";
import { useNetwork } from "../stores/useNetwork";
import { useSpots } from "../stores/useSpots";

/**
 * Маленький баннер сверху карты при offline. Показывает «Без сети — карта
 * читается из скачанных регионов». Плюс если есть pending sync споты —
 * добавляет «N не синкнуто, сделаем при возврате связи».
 */
export function NetworkBanner() {
  const online = useNetwork((s) => s.online);
  const pendingCount = useSpots((s) =>
    s.spots.filter((sp) => sp.sync_state !== "synced" && !sp.deleted_at).length,
  );

  const slide = useRef(new Animated.Value(-50)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: online ? -50 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [online, slide]);

  if (online) return null;

  return (
    <Animated.View
      style={[styles.banner, { transform: [{ translateY: slide }] }]}
      pointerEvents="none"
    >
      <Text style={styles.text}>
        {pendingCount > 0
          ? `Офлайн · ${pendingCount} спот${pendingCount === 1 ? "" : pendingCount < 5 ? "а" : "ов"} не синкнуто`
          : "Офлайн · карта работает из скачанных районов"}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: palette.light.ink,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    zIndex: 100,
  },
  text: {
    color: palette.light.paper,
    fontSize: fontSize.sm,
    textAlign: "center",
  },
});
