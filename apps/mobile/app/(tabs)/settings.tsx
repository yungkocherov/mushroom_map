import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { palette, fontSize, spacing, radius } from "@mushroom-map/tokens/native";
import { isLoggedIn, loginWithYandex, logout } from "../../services/auth";
import { useOfflineRegions } from "../../stores/useOfflineRegions";

const YANDEX_MOBILE_CLIENT_ID =
  process.env.EXPO_PUBLIC_YANDEX_MOBILE_CLIENT_ID ?? "";

export default function SettingsScreen() {
  const router = useRouter();
  const [logged, setLogged] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const downloadedCount = useOfflineRegions((s) => s.downloaded.size);
  const availableCount = useOfflineRegions((s) => s.available.length);
  const refreshRegions = useOfflineRegions((s) => s.refresh);

  useEffect(() => {
    void isLoggedIn().then(setLogged);
    if (availableCount === 0) void refreshRegions();
  }, [availableCount, refreshRegions]);

  const onLogin = async () => {
    if (!YANDEX_MOBILE_CLIENT_ID) {
      Alert.alert(
        "OAuth не настроен",
        "EXPO_PUBLIC_YANDEX_MOBILE_CLIENT_ID не задан. Зарегистрируй приложение на oauth.yandex.ru, добавь redirect uri geobiom://auth/callback и пропиши client_id в .env.",
      );
      return;
    }
    setBusy(true);
    const result = await loginWithYandex(YANDEX_MOBILE_CLIENT_ID);
    setBusy(false);
    if (result.kind === "ok") {
      setLogged(true);
      Alert.alert("Готово", `Вход выполнен${result.userEmail ? ` (${result.userEmail})` : ""}`);
    } else if (result.kind === "error") {
      Alert.alert("Ошибка", result.message);
    }
  };

  const onLogout = async () => {
    setBusy(true);
    await logout();
    setBusy(false);
    setLogged(false);
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Настройки</Text>

      <Section title="Аккаунт">
        <Text style={styles.body}>
          {logged === null
            ? "Проверяю статус…"
            : logged
              ? "Ты вошёл через Яндекс. Споты синхронизируются с geobiom.ru."
              : "Без логина споты живут только на этом телефоне. Вход — синк с сайтом."}
        </Text>
        {logged ? (
          <Pressable
            style={[styles.btnSecondary, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={onLogout}
          >
            <Text style={styles.btnSecondaryText}>Выйти</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.btnPrimary, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={onLogin}
          >
            <Text style={styles.btnPrimaryText}>Войти через Яндекс</Text>
          </Pressable>
        )}
      </Section>

      <Section title="Регионы">
        <Text style={styles.body}>
          {downloadedCount === 0
            ? "Скачай районы где обычно ходишь — карта будет работать в лесу без сети."
            : `Скачано: ${downloadedCount} из ${availableCount} районов.`}
        </Text>
        <Pressable
          style={styles.btnSecondary}
          onPress={() => router.push("/regions" as never)}
        >
          <Text style={styles.btnSecondaryText}>Управление регионами →</Text>
        </Pressable>
      </Section>

      <Section title="О приложении">
        <Text style={styles.kv}>Версия: {Constants.expoConfig?.version ?? "?"}</Text>
        <Text style={styles.kv}>API: api.geobiom.ru</Text>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: palette.light.paper,
  },
  content: {
    padding: spacing[5],
    paddingBottom: spacing[7],
  },
  h1: {
    fontSize: fontSize.h1,
    color: palette.light.ink,
    marginBottom: spacing[5],
  },
  section: {
    backgroundColor: palette.light.paperRise,
    padding: spacing[4],
    borderRadius: radius.md,
    marginBottom: spacing[4],
    borderWidth: 1,
    borderColor: palette.light.rule,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    color: palette.light.ink,
    marginBottom: spacing[3],
  },
  body: {
    fontSize: fontSize.body,
    color: palette.light.inkDim,
    lineHeight: fontSize.body * 1.55,
    marginBottom: spacing[3],
  },
  kv: {
    fontSize: fontSize.sm,
    color: palette.light.inkDim,
    fontVariant: ["tabular-nums"],
  },
  todo: {
    fontSize: fontSize.xs,
    color: palette.light.chanterelle,
    letterSpacing: 1.5,
  },
  btnPrimary: {
    backgroundColor: palette.light.chanterelle,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: radius.md,
    alignItems: "center",
  },
  btnPrimaryText: {
    color: palette.light.paper,
    fontSize: fontSize.body,
  },
  btnSecondary: {
    borderWidth: 1,
    borderColor: palette.light.rule,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: radius.md,
    alignItems: "center",
  },
  btnSecondaryText: {
    color: palette.light.ink,
    fontSize: fontSize.body,
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
