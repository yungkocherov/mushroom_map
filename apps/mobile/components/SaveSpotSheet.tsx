import { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { palette, fontSize, spacing, radius } from "@mushroom-map/tokens/native";
import { useUserLocation } from "../stores/useUserLocation";
import { useSpots } from "../stores/useSpots";

const RATING_LABELS = ["плохое", "скучное", "норм", "хорошее", "отличное"];

const POPULAR_TAGS = [
  "boletus-edulis",
  "leccinum-scabrum",
  "leccinum-aurantiacum",
  "cantharellus-cibarius",
  "imleria-badia",
  "lactarius-deliciosus",
  "russula",
] as const;

const TAG_RU: Record<string, string> = {
  "boletus-edulis": "Белый",
  "leccinum-scabrum": "Подберёзовик",
  "leccinum-aurantiacum": "Подосиновик",
  "cantharellus-cibarius": "Лисичка",
  "imleria-badia": "Польский",
  "lactarius-deliciosus": "Рыжик",
  russula: "Сыроежка",
};

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function SaveSpotSheet({ visible, onClose }: Props) {
  const fix = useUserLocation((s) => s.fix);
  const add = useSpots((s) => s.add);

  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [rating, setRating] = useState(4);
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setName("");
      setNote("");
      setRating(4);
      setTags(new Set());
    }
  }, [visible]);

  const toggleTag = (slug: string) => {
    const next = new Set(tags);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setTags(next);
  };

  const onSave = async () => {
    if (!fix) {
      Alert.alert("Нет GPS", "Подожди фикса позиции, потом сохраняй.");
      return;
    }
    setBusy(true);
    try {
      await add({
        lat: fix.lat,
        lon: fix.lon,
        name: name.trim() || null,
        note: note.trim() || null,
        rating,
        tags: Array.from(tags),
      });
      onClose();
    } catch (err) {
      Alert.alert("Ошибка", err instanceof Error ? err.message : "save-failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.handle} />
            <Text style={styles.title}>Сохранить спот</Text>

            {fix ? (
              <Text style={styles.coords}>
                {fix.lat.toFixed(5)}, {fix.lon.toFixed(5)} · ±
                {fix.accuracy != null ? Math.round(fix.accuracy) : "?"} м
              </Text>
            ) : (
              <Text style={styles.coordsWarn}>
                GPS ещё не пришёл — спот сохранить пока нельзя.
              </Text>
            )}

            <Text style={styles.label}>Название</Text>
            <TextInput
              style={styles.input}
              placeholder="Поляна с боровиками…"
              placeholderTextColor={palette.light.inkDim}
              value={name}
              onChangeText={setName}
              maxLength={100}
            />

            <Text style={styles.label}>Заметка</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              placeholder="Что нашёл, какой склон, ориентир…"
              placeholderTextColor={palette.light.inkDim}
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={3}
              maxLength={500}
            />

            <Text style={styles.label}>Оценка места</Text>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((r) => (
                <Pressable
                  key={r}
                  style={[
                    styles.ratingChip,
                    r === rating && styles.ratingChipActive,
                  ]}
                  onPress={() => setRating(r)}
                >
                  <Text
                    style={[
                      styles.ratingChipText,
                      r === rating && styles.ratingChipTextActive,
                    ]}
                  >
                    {r}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.ratingLabel}>{RATING_LABELS[rating - 1]}</Text>

            <Text style={styles.label}>Что нашёл</Text>
            <View style={styles.tagsRow}>
              {POPULAR_TAGS.map((slug) => (
                <Pressable
                  key={slug}
                  style={[
                    styles.tagChip,
                    tags.has(slug) && styles.tagChipActive,
                  ]}
                  onPress={() => toggleTag(slug)}
                >
                  <Text
                    style={[
                      styles.tagChipText,
                      tags.has(slug) && styles.tagChipTextActive,
                    ]}
                  >
                    {TAG_RU[slug] ?? slug}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.actions}>
              <Pressable style={styles.btnSecondary} onPress={onClose}>
                <Text style={styles.btnSecondaryText}>Отмена</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.btnPrimary,
                  (!fix || busy) && styles.btnDisabled,
                ]}
                disabled={!fix || busy}
                onPress={onSave}
              >
                <Text style={styles.btnPrimaryText}>
                  {busy ? "Сохраняю…" : "Сохранить"}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(32,36,30,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: palette.light.paper,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "90%",
  },
  content: {
    padding: spacing[5],
    paddingTop: spacing[3],
    paddingBottom: spacing[7],
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.light.rule,
    marginBottom: spacing[4],
  },
  title: {
    fontSize: fontSize.h2,
    color: palette.light.ink,
    marginBottom: spacing[3],
  },
  coords: {
    fontSize: fontSize.sm,
    color: palette.light.inkDim,
    fontVariant: ["tabular-nums"],
    marginBottom: spacing[4],
  },
  coordsWarn: {
    fontSize: fontSize.sm,
    color: palette.light.danger,
    marginBottom: spacing[4],
  },
  label: {
    fontSize: fontSize.sm,
    color: palette.light.inkDim,
    marginTop: spacing[3],
    marginBottom: spacing[2],
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.light.rule,
    borderRadius: radius.md,
    padding: spacing[3],
    fontSize: fontSize.body,
    color: palette.light.ink,
    backgroundColor: palette.light.paperRise,
  },
  inputMulti: {
    minHeight: 70,
    textAlignVertical: "top",
  },
  ratingRow: {
    flexDirection: "row",
    gap: spacing[2],
  },
  ratingChip: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.light.rule,
    alignItems: "center",
  },
  ratingChipActive: {
    backgroundColor: palette.light.chanterelle,
    borderColor: palette.light.chanterelle,
  },
  ratingChipText: {
    color: palette.light.ink,
    fontSize: fontSize.body,
  },
  ratingChipTextActive: {
    color: palette.light.paper,
  },
  ratingLabel: {
    color: palette.light.inkDim,
    fontSize: fontSize.sm,
    marginTop: spacing[2],
    textAlign: "center",
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
    borderWidth: 1,
    borderColor: palette.light.rule,
    backgroundColor: palette.light.paperRise,
  },
  tagChipActive: {
    backgroundColor: palette.light.forest,
    borderColor: palette.light.forest,
  },
  tagChipText: {
    color: palette.light.ink,
    fontSize: fontSize.sm,
  },
  tagChipTextActive: {
    color: palette.light.paper,
  },
  actions: {
    flexDirection: "row",
    gap: spacing[3],
    marginTop: spacing[5],
  },
  btnSecondary: {
    flex: 1,
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.light.rule,
    alignItems: "center",
  },
  btnSecondaryText: {
    color: palette.light.ink,
    fontSize: fontSize.body,
  },
  btnPrimary: {
    flex: 2,
    padding: spacing[3],
    borderRadius: radius.md,
    backgroundColor: palette.light.chanterelle,
    alignItems: "center",
  },
  btnPrimaryText: {
    color: palette.light.paper,
    fontSize: fontSize.body,
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
