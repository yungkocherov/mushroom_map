import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { palette, fontSize, spacing, radius } from "@mushroom-map/tokens/native";
import {
  topSpeciesForForestType,
  type SpeciesForTree,
} from "../../services/affinity";

export type ForestFeatureProps = {
  dominant_species?: string | null;
  bonitet?: string | number | null;
  age_group?: string | null;
  age?: number | null;
  source?: string | null;
};

const SPECIES_RU: Record<string, string> = {
  pine: "Сосновый",
  spruce: "Еловый",
  birch: "Берёзовый",
  aspen: "Осиновый",
  oak: "Дубовый",
  alder: "Ольховый",
  willow: "Ивовый",
  fir: "Пихтовый",
  larch: "Лиственничный",
  linden: "Липовый",
  maple: "Кленовый",
  ash: "Ясеневый",
  elm: "Вязовый",
  mixed: "Смешанный",
  mixed_coniferous: "Хвойно-смешанный",
  unknown: "Неопределён",
};

const AGE_GROUP_RU: Record<string, string> = {
  young: "молодняк",
  middle: "средневозрастный",
  pre_mature: "приспевающий",
  mature: "спелый",
  over_mature: "перестойный",
  unknown: "неопр.",
};

function formatTitle(props: ForestFeatureProps): string {
  if (!props.dominant_species) return "Лес";
  return SPECIES_RU[props.dominant_species] ?? props.dominant_species;
}

function formatAge(props: ForestFeatureProps): string {
  const parts: string[] = [];
  if (typeof props.age === "number" && props.age > 0) {
    parts.push(`${props.age} лет`);
  }
  if (props.age_group) {
    parts.push(AGE_GROUP_RU[props.age_group] ?? props.age_group);
  }
  return parts.join(" · ") || "—";
}

type Props = {
  visible: boolean;
  feature: ForestFeatureProps | null;
  onClose: () => void;
};

export function ForestPopup({ visible, feature, onClose }: Props) {
  const [topSpecies, setTopSpecies] = useState<SpeciesForTree[]>([]);

  useEffect(() => {
    if (!feature?.dominant_species) {
      setTopSpecies([]);
      return;
    }
    let cancelled = false;
    void topSpeciesForForestType(feature.dominant_species, 5).then((result) => {
      if (!cancelled) setTopSpecies(result);
    });
    return () => {
      cancelled = true;
    };
  }, [feature?.dominant_species]);

  if (!feature) return null;

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
            <Text style={styles.title}>{formatTitle(feature)}</Text>

            <View style={styles.kvBlock}>
              <KV label="порода" value={SPECIES_RU[feature.dominant_species ?? ""] ?? feature.dominant_species ?? "—"} />
              <KV label="возраст" value={formatAge(feature)} />
              <KV label="бонитет" value={feature.bonitet != null ? String(feature.bonitet) : "—"} />
              {feature.source ? <KV label="источник" value={feature.source} /> : null}
            </View>

            {topSpecies.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Виды по биотопу</Text>
                {topSpecies.map((sp, i) => (
                  <View key={sp.slug} style={styles.speciesRow}>
                    <Text style={styles.speciesIdx}>{i + 1}.</Text>
                    <Text style={styles.speciesName}>{sp.slug}</Text>
                    <Text style={styles.speciesAffinity}>
                      {sp.affinity.toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>Закрыть</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
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
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(32,36,30,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: palette.light.paper,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "75%",
  },
  content: {
    padding: spacing[5],
    paddingTop: spacing[3],
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
    marginBottom: spacing[4],
  },
  kvBlock: {
    backgroundColor: palette.light.paperRise,
    padding: spacing[4],
    borderRadius: radius.md,
    gap: spacing[2],
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
    marginTop: spacing[5],
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    color: palette.light.ink,
    marginBottom: spacing[3],
  },
  speciesRow: {
    flexDirection: "row",
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: palette.light.rule,
    gap: spacing[3],
  },
  speciesIdx: {
    color: palette.light.inkDim,
    fontSize: fontSize.sm,
    width: 20,
  },
  speciesName: {
    flex: 1,
    color: palette.light.ink,
    fontSize: fontSize.sm,
  },
  speciesAffinity: {
    color: palette.light.chanterelle,
    fontSize: fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  closeBtn: {
    marginTop: spacing[5],
    padding: spacing[3],
    borderRadius: radius.md,
    backgroundColor: palette.light.paperRise,
    alignItems: "center",
  },
  closeBtnText: {
    color: palette.light.ink,
    fontSize: fontSize.body,
  },
});
