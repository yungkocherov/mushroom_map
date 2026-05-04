import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { palette, fontSize, spacing, radius } from "@mushroom-map/tokens/native";
import {
  AGE_GROUP_COLORS,
  BONITET_COLORS,
  SPECIES_COLORS,
  type ForestColorMode,
} from "./style";

/**
 * Легенда раскраски forest-fill. Содержание зависит от текущего
 * forestColorMode из LayerSheet:
 *   - species: 14 пород коры
 *   - bonitet: 5 классов бонитета 1..5 + unknown
 *   - age:     5 возрастных групп Rosleshoz + unknown
 *
 * Цвета берутся из *_COLORS, экспортированных из style.ts.
 */

const SPECIES_ORDER: Array<{ slug: keyof typeof SPECIES_COLORS; label: string }> = [
  { slug: "pine",              label: "Сосна" },
  { slug: "spruce",            label: "Ель" },
  { slug: "fir",               label: "Пихта" },
  { slug: "larch",             label: "Лиственница" },
  { slug: "cedar",             label: "Кедр" },
  { slug: "birch",             label: "Берёза" },
  { slug: "aspen",             label: "Осина" },
  { slug: "alder",             label: "Ольха" },
  { slug: "oak",               label: "Дуб" },
  { slug: "linden",            label: "Липа" },
  { slug: "maple",             label: "Клён" },
  { slug: "mixed_coniferous",  label: "Смеш. хвойный" },
  { slug: "mixed_broadleaved", label: "Смеш. лиственный" },
  { slug: "mixed",             label: "Смешанный" },
  { slug: "unknown",           label: "Неизвестно" },
];

const BONITET_ORDER: Array<{ color: string; label: string }> = [
  { color: BONITET_COLORS[1], label: "I — высший" },
  { color: BONITET_COLORS[2], label: "II" },
  { color: BONITET_COLORS[3], label: "III" },
  { color: BONITET_COLORS[4], label: "IV" },
  { color: BONITET_COLORS[5], label: "V — низший" },
  { color: BONITET_COLORS.unknown, label: "Нет данных" },
];

const AGE_ORDER: Array<{ color: string; label: string }> = [
  { color: AGE_GROUP_COLORS["молодняки"],        label: "Молодняки" },
  { color: AGE_GROUP_COLORS["средневозрастные"], label: "Средневозрастные" },
  { color: AGE_GROUP_COLORS["приспевающие"],     label: "Приспевающие" },
  { color: AGE_GROUP_COLORS["спелые"],           label: "Спелые" },
  { color: AGE_GROUP_COLORS["перестойные"],      label: "Перестойные" },
  { color: AGE_GROUP_COLORS.unknown,             label: "Нет данных" },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  mode?: ForestColorMode;
};

export function Legend({ visible, onClose, mode = "species" }: Props) {
  let title: string;
  let subtitle: string;
  let items: Array<{ color: string; label: string }>;

  if (mode === "bonitet") {
    title = "Бонитет";
    subtitle =
      "Класс качества местопроизрастания (I — самый продуктивный, V — самый бедный).";
    items = BONITET_ORDER;
  } else if (mode === "age") {
    title = "Возрастные группы";
    subtitle =
      "Молодняки до спелых и перестойных (последние интересны для боровиков).";
    items = AGE_ORDER;
  } else {
    title = "Породы";
    subtitle = "Цвет выдела — преобладающая порода по данным ФГИС ЛК.";
    items = SPECIES_ORDER.map((e) => ({
      color: SPECIES_COLORS[e.slug],
      label: e.label,
    }));
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Внутренний Pressable перехватывает тап на самой панели,
            чтобы не закрыть modal случайно. */}
        <Pressable style={styles.panel} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {items.map((entry) => (
              <View key={entry.label} style={styles.row}>
                <View style={[styles.swatch, { backgroundColor: entry.color }]} />
                <Text style={styles.label}>{entry.label}</Text>
              </View>
            ))}
          </ScrollView>
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Закрыть</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  panel: {
    backgroundColor: palette.light.paper,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[5],
    maxHeight: "75%",
  },
  title: {
    fontSize: fontSize.h2,
    color: palette.light.ink,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: palette.light.inkDim,
    marginTop: spacing[1],
    marginBottom: spacing[3],
    lineHeight: fontSize.sm * 1.45,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingVertical: spacing[2],
    gap: spacing[2],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: spacing[1],
  },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
  },
  label: {
    fontSize: fontSize.body,
    color: palette.light.ink,
  },
  closeBtn: {
    marginTop: spacing[3],
    paddingVertical: spacing[3],
    backgroundColor: palette.light.paperRise,
    borderRadius: radius.md,
    alignItems: "center",
  },
  closeBtnText: {
    fontSize: fontSize.body,
    color: palette.light.ink,
    fontWeight: "500",
  },
});
