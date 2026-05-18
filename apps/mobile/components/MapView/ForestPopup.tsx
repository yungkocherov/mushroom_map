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
import { speciesNameRu } from "../../services/speciesCatalog";
import { fetchPopupData, type PopupData } from "../../services/mapPopupApi";
import { ForestBlock } from "./popup/ForestBlock";
import { SpeciesList } from "./popup/SpeciesList";
import { SoilBlock } from "./popup/SoilBlock";
import { WaterBlock } from "./popup/WaterBlock";
import { TerrainBlock } from "./popup/TerrainBlock";

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
  coords: { lat: number; lon: number } | null;
  onClose: () => void;
  onSaveSpot: (args: {
    lat: number;
    lon: number;
    speciesContext: string[];
  }) => void;
};

export function ForestPopup({
  visible,
  feature,
  coords,
  onClose,
  onSaveSpot,
}: Props) {
  const [topSpecies, setTopSpecies] = useState<SpeciesForTree[]>([]);
  const [data, setData] = useState<PopupData | null>(null);
  const [loadState, setLoadState] = useState<
    "idle" | "loading" | "online" | "offline"
  >("idle");

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

  useEffect(() => {
    if (!visible || !coords) {
      setData(null);
      setLoadState("idle");
      return;
    }
    let cancelled = false;
    setLoadState("loading");
    fetchPopupData(coords.lat, coords.lon)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setLoadState("online");
      })
      .catch(() => {
        if (cancelled) return;
        setData(null);
        setLoadState("offline");
      });
    return () => {
      cancelled = true;
    };
  }, [visible, coords?.lat, coords?.lon]);

  if (!feature) return null;

  const onlineForest =
    loadState === "online" && data?.forest.forest ? data.forest.forest : null;
  const onlineSpecies =
    loadState === "online" && data?.forest.species_theoretical?.length
      ? data.forest.species_theoretical
      : null;

  function handleSave() {
    if (!coords) return;
    const composition = data?.forest.forest?.species_composition;
    let speciesContext = composition ? Object.keys(composition) : [];
    if (speciesContext.length === 0) {
      speciesContext = feature?.dominant_species
        ? [feature.dominant_species]
        : [];
    }
    onSaveSpot({ lat: coords.lat, lon: coords.lon, speciesContext });
    onClose();
  }

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

            {onlineForest ? (
              <ForestBlock forest={onlineForest} />
            ) : (
              <>
                <Text style={styles.title}>{formatTitle(feature)}</Text>
                <View style={styles.kvBlock}>
                  <KV label="порода" value={SPECIES_RU[feature.dominant_species ?? ""] ?? feature.dominant_species ?? "—"} />
                  <KV label="возраст" value={formatAge(feature)} />
                  <KV label="бонитет" value={feature.bonitet != null ? String(feature.bonitet) : "—"} />
                  {feature.source ? <KV label="источник" value={feature.source} /> : null}
                </View>
              </>
            )}

            {loadState === "loading" ? (
              <Text style={styles.mutedLine}>Загрузка…</Text>
            ) : null}

            {onlineSpecies ? (
              <SpeciesList species={onlineSpecies} />
            ) : topSpecies.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Виды по биотопу</Text>
                {topSpecies.map((sp, i) => (
                  <View key={sp.slug} style={styles.speciesRow}>
                    <Text style={styles.speciesIdx}>{i + 1}.</Text>
                    <Text style={styles.speciesName}>{speciesNameRu(sp.slug)}</Text>
                    <Text style={styles.speciesAffinity}>
                      {sp.affinity.toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {loadState === "online" ? (
              <>
                {data?.soil ? <SoilBlock soil={data.soil} /> : null}
                {data?.water ? <WaterBlock water={data.water} /> : null}
                {data?.terrain ? (
                  <TerrainBlock terrain={data.terrain} />
                ) : null}
              </>
            ) : null}

            {loadState === "offline" ? (
              <Text style={styles.mutedLine}>
                Доп. данные (почва/вода/рельеф) — нет сети
              </Text>
            ) : null}

            {coords ? (
              <Pressable style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveBtnText}>Сохранить место</Text>
              </Pressable>
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
  mutedLine: {
    marginTop: spacing[4],
    color: palette.light.inkDim,
    fontSize: fontSize.sm,
  },
  saveBtn: {
    marginTop: spacing[5],
    padding: spacing[3],
    borderRadius: radius.md,
    backgroundColor: palette.light.chanterelle,
    alignItems: "center",
  },
  saveBtnText: {
    color: palette.light.paper,
    fontSize: fontSize.body,
  },
  closeBtn: {
    marginTop: spacing[3],
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
