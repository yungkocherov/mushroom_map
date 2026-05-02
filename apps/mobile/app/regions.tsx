import { useEffect, useMemo } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { palette, fontSize, spacing, radius } from "@mushroom-map/tokens/native";
import { useOfflineRegions } from "../stores/useOfflineRegions";
import type { Region } from "../services/regions";

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export default function RegionsScreen() {
  const router = useRouter();
  const available = useOfflineRegions((s) => s.available);
  const downloaded = useOfflineRegions((s) => s.downloaded);
  const outdated = useOfflineRegions((s) => s.outdated);
  const inProgress = useOfflineRegions((s) => s.inProgress);
  const loading = useOfflineRegions((s) => s.loading);
  const error = useOfflineRegions((s) => s.error);
  const refresh = useOfflineRegions((s) => s.refresh);
  const startDownload = useOfflineRegions((s) => s.startDownload);
  const cancel = useOfflineRegions((s) => s.cancel);
  const remove = useOfflineRegions((s) => s.remove);

  useEffect(() => {
    if (available.length === 0) void refresh();
  }, [available.length, refresh]);

  const sorted = useMemo(
    () => [...available].sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [available],
  );

  const onTap = async (region: Region) => {
    if (inProgress[region.slug]) {
      Alert.alert(
        region.name,
        "Скачивание идёт. Прервать?",
        [
          { text: "Нет", style: "cancel" },
          { text: "Прервать", style: "destructive", onPress: () => cancel(region.slug) },
        ],
      );
      return;
    }
    if (outdated.has(region.slug)) {
      Alert.alert(
        region.name,
        `Доступно обновление (${formatMb(region.total_size_bytes)}). Скачать новую версию?`,
        [
          { text: "Позже", style: "cancel" },
          {
            text: "Обновить",
            onPress: async () => {
              await remove(region.slug);
              const result = await startDownload(region.slug);
              if (result.kind === "error") Alert.alert("Ошибка", result.message);
            },
          },
        ],
      );
      return;
    }
    if (downloaded.has(region.slug)) {
      Alert.alert(
        region.name,
        `Удалить скачанный регион (${formatMb(region.total_size_bytes)})?`,
        [
          { text: "Отмена", style: "cancel" },
          {
            text: "Удалить",
            style: "destructive",
            onPress: () => remove(region.slug),
          },
        ],
      );
      return;
    }
    const result = await startDownload(region.slug);
    if (result.kind === "error") {
      Alert.alert("Ошибка", result.message);
    }
  };

  const renderItem = ({ item }: { item: Region }) => {
    const isDone = downloaded.has(item.slug);
    const isOutdated = outdated.has(item.slug);
    const dl = inProgress[item.slug];
    const isProgress = !!dl;
    const percent = dl
      ? Math.min(100, Math.floor((dl.bytes_done / dl.bytes_total) * 100))
      : 0;

    let status: string;
    let statusColor: string;
    if (isProgress) {
      status = `Скачивание · ${dl.layer} · ${percent}% · нажми чтобы прервать`;
      statusColor = palette.light.chanterelle;
    } else if (isOutdated) {
      status = "Обновление доступно — нажми чтобы скачать";
      statusColor = palette.light.caution;
    } else if (isDone) {
      status = "Скачано · нажми чтобы удалить";
      statusColor = palette.light.forest;
    } else {
      status = `${formatMb(item.total_size_bytes)} · ${item.layers.length} слоёв`;
      statusColor = palette.light.inkDim;
    }

    return (
      <Pressable
        style={({ pressed }) => [
          styles.row,
          pressed && { backgroundColor: palette.light.paperRise },
        ]}
        onPress={() => onTap(item)}
      >
        <View style={styles.rowMain}>
          <Text style={styles.rowTitle}>{item.name}</Text>
          <Text style={[styles.rowStatus, { color: statusColor }]}>
            {status}
          </Text>
        </View>
        {isProgress ? (
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${percent}%` },
              ]}
            />
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: "Регионы",
          headerStyle: { backgroundColor: palette.light.paperRise },
          headerTintColor: palette.light.ink,
        }}
      />
      <Text style={styles.lead}>
        Скачай районы где обычно ходишь — карта будет работать в лесу без сети.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={sorted}
        keyExtractor={(r) => r.slug}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refresh}
            tintColor={palette.light.chanterelle}
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {loading
              ? "Загружаю список регионов…"
              : "Регионы пока не доступны. Pull-to-refresh для повтора."}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.light.paper,
  },
  lead: {
    fontSize: fontSize.body,
    color: palette.light.inkDim,
    padding: spacing[5],
    paddingBottom: spacing[3],
    lineHeight: fontSize.body * 1.55,
  },
  error: {
    fontSize: fontSize.sm,
    color: palette.light.danger,
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[3],
  },
  empty: {
    fontSize: fontSize.body,
    color: palette.light.inkDim,
    textAlign: "center",
    padding: spacing[6],
  },
  row: {
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[5],
  },
  rowMain: {
    flexDirection: "column",
    gap: spacing[1],
  },
  rowTitle: {
    fontSize: fontSize.lg,
    color: palette.light.ink,
  },
  rowStatus: {
    fontSize: fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  progressBarTrack: {
    marginTop: spacing[2],
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: palette.light.rule,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: palette.light.chanterelle,
  },
  sep: {
    height: 1,
    backgroundColor: palette.light.rule,
    marginHorizontal: spacing[5],
  },
});
