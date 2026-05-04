import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { palette, fontSize, spacing, radius } from "@mushroom-map/tokens/native";
import { apiRequest, ApiError } from "../../services/api";

/**
 * Полноэкранный overlay для поиска по топонимам и видам.
 *
 * Запрос дебаунсится 250мс; результаты двух endpoint'ов рисуются под
 * заголовками «Места» / «Виды». Места — fetch /api/places/search,
 * виды — /api/species/search.
 *
 * Tap на место → onPickPlace(lat, lon, label): закрываем overlay,
 *   родитель центрирует камеру.
 * Tap на вид → push в /species/[slug].
 */

type PlaceResult = {
  kind: string;        // settlement | lake | river | tract | station | poi | district
  name: string;
  lat: number;
  lon: number;
  district_admin_area_id?: number | null;
  popularity?: number | null;
};

type SpeciesResult = {
  slug: string;
  name_ru: string;
  name_lat?: string | null;
};

const KIND_RU: Record<string, string> = {
  settlement: "населённый пункт",
  lake: "озеро",
  river: "река",
  tract: "урочище",
  station: "станция",
  poi: "точка",
  district: "район",
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onPickPlace: (lat: number, lon: number, label: string) => void;
};

export function SearchOverlay({ visible, onClose, onPickPlace }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [species, setSpecies] = useState<SpeciesResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // При открытии overlay'а очищаем предыдущий запрос и фокусируем input.
  useEffect(() => {
    if (visible) {
      setQuery("");
      setPlaces([]);
      setSpecies([]);
      setError(null);
      // Небольшая задержка — Modal может ещё не быть в дереве.
      const t = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
    return;
  }, [visible]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setPlaces([]);
      setSpecies([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const [placesRes, speciesRes] = await Promise.allSettled([
          apiRequest<PlaceResult[]>(
            `/api/places/search?q=${encodeURIComponent(q)}&limit=10`,
            { auth: false },
          ),
          apiRequest<SpeciesResult[]>(
            `/api/species/search?q=${encodeURIComponent(q)}&limit=10`,
            { auth: false },
          ),
        ]);
        setPlaces(placesRes.status === "fulfilled" ? placesRes.value : []);
        setSpecies(speciesRes.status === "fulfilled" ? speciesRes.value : []);
        const errs = [placesRes, speciesRes].filter((r) => r.status === "rejected");
        if (errs.length === 2) {
          const first = errs[0] as PromiseRejectedResult;
          setError(
            first.reason instanceof ApiError
              ? first.reason.message
              : "Поиск недоступен — нет сети",
          );
        } else {
          setError(null);
        }
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const renderEmpty = () => {
    if (query.trim().length < 2) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            Введи название места (село, озеро, река) или гриба.
          </Text>
        </View>
      );
    }
    if (loading) return null;
    if (error) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      );
    }
    if (places.length === 0 && species.length === 0) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Ничего не нашлось</Text>
        </View>
      );
    }
    return null;
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.searchRow}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Поиск: место, вид…"
            placeholderTextColor={palette.light.inkDim}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          <Pressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Закрыть</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={palette.light.chanterelle} />
          </View>
        ) : null}

        <FlatList
          data={[
            ...(places.length > 0
              ? [{ type: "header", label: "Места" } as const]
              : []),
            ...places.map((p) => ({ type: "place", value: p } as const)),
            ...(species.length > 0
              ? [{ type: "header", label: "Виды" } as const]
              : []),
            ...species.map((s) => ({ type: "species", value: s } as const)),
          ]}
          keyExtractor={(item, idx) => {
            if (item.type === "header") return `h-${item.label}`;
            if (item.type === "place")
              return `p-${item.value.kind}-${item.value.name}-${idx}`;
            return `s-${item.value.slug}`;
          }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            if (item.type === "header") {
              return <Text style={styles.sectionHeader}>{item.label}</Text>;
            }
            if (item.type === "place") {
              const p = item.value;
              return (
                <Pressable
                  style={styles.row}
                  onPress={() => {
                    onPickPlace(p.lat, p.lon, p.name);
                    onClose();
                  }}
                >
                  <Text style={styles.rowTitle}>{p.name}</Text>
                  <Text style={styles.rowMeta}>
                    {KIND_RU[p.kind] ?? p.kind}
                  </Text>
                </Pressable>
              );
            }
            const s = item.value;
            return (
              <Pressable
                style={styles.row}
                onPress={() => {
                  onClose();
                  router.push({
                    pathname: "/species/[slug]",
                    params: { slug: s.slug },
                  } as never);
                }}
              >
                <Text style={styles.rowTitle}>{s.name_ru}</Text>
                {s.name_lat ? (
                  <Text style={styles.rowMeta}>{s.name_lat}</Text>
                ) : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={renderEmpty}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.light.paper,
    paddingTop: spacing[6],
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[4],
    gap: spacing[2],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: palette.light.rule,
  },
  input: {
    flex: 1,
    fontSize: fontSize.body,
    color: palette.light.ink,
    backgroundColor: palette.light.paperRise,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
  },
  cancelBtn: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
  },
  cancelText: {
    fontSize: fontSize.body,
    color: palette.light.chanterelle,
  },
  loadingRow: {
    paddingVertical: spacing[3],
    alignItems: "center",
  },
  sectionHeader: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
    fontSize: fontSize.xs,
    color: palette.light.inkDim,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: palette.light.rule,
  },
  rowTitle: {
    fontSize: fontSize.body,
    color: palette.light.ink,
  },
  rowMeta: {
    fontSize: fontSize.xs,
    color: palette.light.inkDim,
    marginTop: 2,
  },
  empty: {
    padding: spacing[6],
  },
  emptyText: {
    fontSize: fontSize.body,
    color: palette.light.inkDim,
    textAlign: "center",
    lineHeight: fontSize.body * 1.5,
  },
});
