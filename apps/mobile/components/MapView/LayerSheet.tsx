import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { palette, fontSize, spacing, radius } from "@mushroom-map/tokens/native";
import type { ForestColorMode, OverlayKey } from "./style";

/**
 * Bottom-sheet с переключателями карты:
 *   - Forest color mode: Породы / Бонитет / Возраст
 *   - Overlay layers: вырубки / ООПТ / защитные / водотоки / дороги
 *
 * Tap-outside / «Закрыть» — закрывают.
 */

type OverlayConfig = {
  key: OverlayKey;
  label: string;
  description: string;
};

const OVERLAYS: OverlayConfig[] = [
  {
    key: "felling",
    label: "Вырубки и гари",
    description: "Через 2-3 года там лисички, опята",
  },
  {
    key: "oopt",
    label: "ООПТ",
    description: "Заповедники, заказники — где нельзя собирать",
  },
  {
    key: "protective",
    label: "Защитные леса",
    description: "Леса с ограничениями по сбору",
  },
  {
    key: "waterway",
    label: "Реки и ручьи",
    description: "Линейные водотоки",
  },
  {
    key: "roads",
    label: "Дороги",
    description: "Где поставить машину",
  },
];

const COLOR_MODES: Array<{ id: ForestColorMode; label: string; hint: string }> = [
  { id: "species", label: "Породы",  hint: "Цвет коры по доминанту" },
  { id: "bonitet", label: "Бонитет", hint: "Качество местопроизрастания" },
  { id: "age",     label: "Возраст", hint: "От молодняка до перестойного" },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  forestColorMode: ForestColorMode;
  onForestColorModeChange: (m: ForestColorMode) => void;
  overlays: Partial<Record<OverlayKey, boolean>>;
  onToggleOverlay: (k: OverlayKey, v: boolean) => void;
};

export function LayerSheet({
  visible, onClose,
  forestColorMode, onForestColorModeChange,
  overlays, onToggleOverlay,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.panel} onPress={() => {}}>
          <Text style={styles.title}>Слои карты</Text>

          <Text style={styles.sectionTitle}>Раскраска леса</Text>
          <View style={styles.modeRow}>
            {COLOR_MODES.map((m) => {
              const active = forestColorMode === m.id;
              return (
                <Pressable
                  key={m.id}
                  style={[styles.modeChip, active && styles.modeChipActive]}
                  onPress={() => onForestColorModeChange(m.id)}
                >
                  <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.modeHint}>
            {COLOR_MODES.find((m) => m.id === forestColorMode)?.hint}
          </Text>

          <Text style={styles.sectionTitle}>Дополнительные слои</Text>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {OVERLAYS.map((o) => (
              <View key={o.key} style={styles.row}>
                <View style={styles.rowMain}>
                  <Text style={styles.rowLabel}>{o.label}</Text>
                  <Text style={styles.rowDesc}>{o.description}</Text>
                </View>
                <Switch
                  value={!!overlays[o.key]}
                  onValueChange={(v) => onToggleOverlay(o.key, v)}
                  trackColor={{ true: palette.light.forest, false: palette.light.rule }}
                  thumbColor={palette.light.paper}
                />
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
    maxHeight: "85%",
  },
  title: {
    fontSize: fontSize.h2,
    color: palette.light.ink,
    fontWeight: "600",
    marginBottom: spacing[3],
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    color: palette.light.inkDim,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing[3],
    marginBottom: spacing[2],
  },
  modeRow: {
    flexDirection: "row",
    gap: spacing[2],
  },
  modeChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.light.rule,
    backgroundColor: palette.light.paper,
  },
  modeChipActive: {
    backgroundColor: palette.light.forest,
    borderColor: palette.light.forest,
  },
  modeChipText: {
    fontSize: fontSize.sm,
    color: palette.light.ink,
  },
  modeChipTextActive: {
    color: palette.light.paper,
    fontWeight: "600",
  },
  modeHint: {
    fontSize: fontSize.xs,
    color: palette.light.inkDim,
    marginTop: spacing[1],
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingVertical: spacing[2],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing[3],
    gap: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: palette.light.rule,
  },
  rowMain: {
    flex: 1,
  },
  rowLabel: {
    fontSize: fontSize.body,
    color: palette.light.ink,
    fontWeight: "500",
  },
  rowDesc: {
    fontSize: fontSize.xs,
    color: palette.light.inkDim,
    marginTop: 2,
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
