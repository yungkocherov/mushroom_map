import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { palette, fontSize, spacing, radius } from "@mushroom-map/tokens/native";
import { SPECIES_COLORS } from "./style";

/**
 * Легенда раскраски forest-fill по dominant_species. Полноэкранный modal
 * с tap-outside-to-close, чтобы не отъедать пиксели у карты постоянной
 * floating-панелью. На карте есть кнопка «Легенда» — она открывает этот
 * modal.
 *
 * Slug'и + русские лейблы — те же 14 пород что в web Legend (apps/web/
 * src/components/Legend.tsx + spotTags.ts). 14 «реальных» пород + mixed
 * варианты + unknown. Цвета берутся из SPECIES_COLORS экспортированного
 * из style.ts — single source of truth.
 */

type SpeciesEntry = { slug: keyof typeof SPECIES_COLORS; label: string };

const SPECIES_ORDER: SpeciesEntry[] = [
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

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function Legend({ visible, onClose }: Props) {
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
          <Text style={styles.title}>Породы</Text>
          <Text style={styles.subtitle}>
            Цвет выдела — преобладающая порода по данным ФГИС ЛК.
          </Text>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {SPECIES_ORDER.map((entry) => (
              <View key={entry.slug} style={styles.row}>
                <View style={[styles.swatch, { backgroundColor: SPECIES_COLORS[entry.slug] }]} />
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
