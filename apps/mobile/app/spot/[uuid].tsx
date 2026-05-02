import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Easing,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Magnetometer } from "expo-sensors";
import { palette, fontSize, spacing, radius } from "@mushroom-map/tokens/native";
import { useSpots } from "../../stores/useSpots";
import { useUserLocation } from "../../stores/useUserLocation";
import type { LocalSpot } from "../../services/spotsRepo";

const TAG_RU: Record<string, string> = {
  "boletus-edulis": "Белый",
  "leccinum-scabrum": "Подберёзовик",
  "leccinum-aurantiacum": "Подосиновик",
  "cantharellus-cibarius": "Лисичка",
  "imleria-badia": "Польский",
  "lactarius-deliciosus": "Рыжик",
  russula: "Сыроежка",
};

const RATING_DOT: Record<number, string> = {
  1: palette.light.danger,
  2: palette.light.caution,
  3: palette.light.inkDim,
  4: palette.light.moss,
  5: palette.light.forest,
};

const RATING_LABEL: Record<number, string> = {
  1: "плохое",
  2: "скучное",
  3: "норм",
  4: "хорошее",
  5: "отличное",
};

function haversineMeters(
  lat1: number, lon1: number, lat2: number, lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial bearing (compass deg, 0=N, 90=E) от точки 1 к точке 2. */
function bearingDeg(
  lat1: number, lon1: number, lat2: number, lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return ((θ * 180) / Math.PI + 360) % 360;
}

function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} м`;
  if (m < 10_000) return `${(m / 1000).toFixed(1)} км`;
  return `${Math.round(m / 1000)} км`;
}

export default function SpotDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const router = useRouter();
  const spots = useSpots((s) => s.spots);
  const remove = useSpots((s) => s.remove);
  const fix = useUserLocation((s) => s.fix);

  const spot: LocalSpot | undefined = useMemo(
    () => spots.find((s) => s.client_uuid === uuid),
    [spots, uuid],
  );

  // Magnetometer для направления телефона (heading)
  const [heading, setHeading] = useState(0);
  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    (async () => {
      const granted = await Magnetometer.isAvailableAsync();
      if (!granted) return;
      Magnetometer.setUpdateInterval(200);
      sub = Magnetometer.addListener((data) => {
        // angle 0=N, 90=E. atan2(x,y) дает radians.
        const angle =
          (Math.atan2(data.y, data.x) * 180) / Math.PI;
        setHeading((angle + 360) % 360);
      });
    })();
    return () => {
      sub?.remove();
    };
  }, []);

  // Animation: smooth rotate-to-target
  const arrowAnim = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    if (!spot || !fix) return;
    const target = bearingDeg(fix.lat, fix.lon, spot.lat, spot.lon);
    // arrow points to (target - device heading), мод 360
    const relative = ((target - heading + 540) % 360) - 180;
    Animated.timing(arrowAnim, {
      toValue: relative,
      duration: 200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [spot?.lat, spot?.lon, fix?.lat, fix?.lon, heading, arrowAnim, spot, fix]);

  if (!spot) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: "Спот" }} />
        <Text style={styles.notFound}>
          Спот не найден. Возможно был удалён.
        </Text>
      </View>
    );
  }

  const distance = fix
    ? haversineMeters(fix.lat, fix.lon, spot.lat, spot.lon)
    : null;

  const onDelete = () => {
    Alert.alert(
      "Удалить спот?",
      spot.name?.trim() || "Без названия",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: async () => {
            await remove(spot.client_uuid);
            router.back();
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: spot.name?.trim() || "Спот",
          headerStyle: { backgroundColor: palette.light.paperRise },
          headerTintColor: palette.light.ink,
        }}
      />

      <View style={styles.compassBlock}>
        {fix ? (
          <>
            <View style={styles.compassRing}>
              <Animated.View
                style={[
                  styles.arrowWrap,
                  {
                    transform: [
                      {
                        rotate: arrowAnim.interpolate({
                          inputRange: [-180, 180],
                          outputRange: ["-180deg", "180deg"],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <View style={styles.arrowHead} />
                <View style={styles.arrowTail} />
              </Animated.View>
              <View
                style={[
                  styles.center,
                  { backgroundColor: RATING_DOT[spot.rating ?? 3] },
                ]}
              />
            </View>
            <Text style={styles.distanceText}>
              {formatDistance(distance ?? 0)}
            </Text>
            <Text style={styles.distanceHint}>
              стрелка показывает на спот, держи телефон горизонтально
            </Text>
          </>
        ) : (
          <Text style={styles.distanceHint}>
            GPS не определён — стрелка появится после фикса позиции.
          </Text>
        )}
      </View>

      <View style={styles.kvBlock}>
        <KV label="оценка" value={`${spot.rating ?? "?"} / 5 · ${RATING_LABEL[spot.rating ?? 3]}`} />
        <KV
          label="координаты"
          value={`${spot.lat.toFixed(5)}, ${spot.lon.toFixed(5)}`}
        />
        <KV
          label="создан"
          value={new Date(spot.created_at).toLocaleString("ru-RU")}
        />
        <KV
          label="синк"
          value={spot.sync_state === "synced" ? "✓" : "ожидает"}
        />
      </View>

      {spot.note ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Заметка</Text>
          <Text style={styles.noteText}>{spot.note}</Text>
        </View>
      ) : null}

      {spot.tags.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Теги</Text>
          <View style={styles.tagsRow}>
            {spot.tags.map((slug) => (
              <View key={slug} style={styles.tagChip}>
                <Text style={styles.tagChipText}>
                  {TAG_RU[slug] ?? slug}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <Pressable style={styles.deleteBtn} onPress={onDelete}>
        <Text style={styles.deleteBtnText}>Удалить спот</Text>
      </Pressable>
    </ScrollView>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.light.paper,
  },
  content: {
    padding: spacing[5],
    paddingBottom: spacing[7],
  },
  notFound: {
    padding: spacing[6],
    color: palette.light.inkDim,
    textAlign: "center",
  },
  compassBlock: {
    alignItems: "center",
    marginVertical: spacing[5],
  },
  compassRing: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: palette.light.rule,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowWrap: {
    position: "absolute",
    width: 6,
    height: 160,
    alignItems: "center",
  },
  arrowHead: {
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderBottomWidth: 24,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: palette.light.chanterelle,
  },
  arrowTail: {
    width: 4,
    flex: 1,
    backgroundColor: palette.light.chanterelle,
    marginTop: -2,
  },
  center: {
    width: 12,
    height: 12,
    borderRadius: 6,
    position: "absolute",
  },
  distanceText: {
    fontSize: fontSize.h2,
    color: palette.light.ink,
    marginTop: spacing[4],
    fontVariant: ["tabular-nums"],
  },
  distanceHint: {
    fontSize: fontSize.sm,
    color: palette.light.inkDim,
    marginTop: spacing[2],
    textAlign: "center",
    paddingHorizontal: spacing[5],
  },
  kvBlock: {
    backgroundColor: palette.light.paperRise,
    padding: spacing[4],
    borderRadius: radius.md,
    gap: spacing[2],
    marginBottom: spacing[4],
  },
  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  kvLabel: {
    color: palette.light.inkDim,
    fontSize: fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  kvValue: {
    color: palette.light.ink,
    fontSize: fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  section: {
    marginBottom: spacing[4],
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    color: palette.light.inkDim,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: spacing[2],
  },
  noteText: {
    fontSize: fontSize.body,
    color: palette.light.ink,
    lineHeight: fontSize.body * 1.55,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
  },
  tagChip: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radius.pill,
    backgroundColor: palette.light.forest,
  },
  tagChipText: {
    color: palette.light.paper,
    fontSize: fontSize.sm,
  },
  deleteBtn: {
    marginTop: spacing[5],
    padding: spacing[4],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.light.danger,
    alignItems: "center",
  },
  deleteBtnText: {
    color: palette.light.danger,
    fontSize: fontSize.body,
  },
});
