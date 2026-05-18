import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import * as Crypto from "expo-crypto";
import { palette, fontSize, spacing, radius } from "@mushroom-map/tokens/native";
import {
  TREE_TAGS,
  MUSHROOM_TAGS,
  BERRY_TAGS,
  type SpotTag,
} from "@mushroom-map/types";
import { useUserLocation } from "../stores/useUserLocation";
import { useSpots } from "../stores/useSpots";
import {
  pickAndStorePhoto,
  photoUri,
  deletePhotoFile,
} from "../services/spotPhotos";

const RATING_LABELS = ["плохое", "скучное", "норм", "хорошее", "отличное"];

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Координаты сохраняемой точки. Если не переданы — берём GPS fix. */
  coords?: { lat: number; lon: number } | null;
  /**
   * Породы тапнутого выдела (slug'и forest species: pine/spruce/birch…).
   * Если непусто — список «Деревья» фильтруется до пород этого полигона
   * (меньше скролла, меньше неверных тэгов). Если ни один tree-tag не
   * совпал — fallback на полный TREE_TAGS (группа никогда не пустая).
   * Long-press по карте → speciesContext отсутствует/пуст → все деревья.
   *
   * Вокабуляр совпадает: TREE_TAGS[].slug берутся из
   * geodata.dominant_species enum'а (см. packages/types/src/spotTags.ts
   * docstring), те же slug'и, что в species_composition/dominant_species
   * выдела — поэтому фильтр прямой, без маппинга.
   */
  speciesContext?: string[];
};

export function SaveSpotSheet({ visible, onClose, coords, speciesContext }: Props) {
  const fix = useUserLocation((s) => s.fix);
  const add = useSpots((s) => s.add);
  // Берём явные координаты (long-press на карте) или fallback на GPS.
  const effectiveCoords = coords ?? (fix ? { lat: fix.lat, lon: fix.lon } : null);

  // Список «Деревья»: если есть species-контекст выдела — фильтруем до
  // его пород (slug'и TREE_TAGS == forest species slug'и, прямой match).
  // Fallback на полный TREE_TAGS чтобы группа НИКОГДА не была пустой
  // (нет контекста — long-press; контекст есть, но ни один tree-tag не
  // совпал — деградируем мягко, показываем всё).
  const tagGroups = useMemo<Array<{ title: string; tags: SpotTag[] }>>(() => {
    const filtered =
      speciesContext && speciesContext.length > 0
        ? TREE_TAGS.filter((t) => speciesContext.includes(t.slug))
        : TREE_TAGS;
    const effectiveTreeTags = filtered.length > 0 ? filtered : TREE_TAGS;
    return [
      { title: "Деревья", tags: effectiveTreeTags },
      { title: "Грибы", tags: MUSHROOM_TAGS },
      { title: "Ягоды", tags: BERRY_TAGS },
    ];
  }, [speciesContext]);

  const sheetRef = useRef<BottomSheet>(null);

  const [name, setName] = useState("");
  const [nameError, setNameError] = useState(false);
  const [note, setNote] = useState("");
  const [rating, setRating] = useState(4);
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [photos, setPhotos] = useState<string[]>([]);
  // UUID черновика. Фото сохраняются по этому UUID до createSpot —
  // если юзер отменяет, они "осиротевают" в documentDirectory; не
  // критично (≤1 МБ на каждый), всё равно при удалении app они уйдут.
  // Cleanup отменённых черновиков — Phase 6 если станет проблемой.
  const [draftUuid, setDraftUuid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Управление через ref-методы (snapToIndex / close). `index` prop у
  // BottomSheet не всегда реагирует на изменение из родителя — особенно
  // при close из onPress кнопки внутри sheet'а. Императивный API
  // надёжнее.
  useEffect(() => {
    if (visible) {
      setName("");
      setNameError(false);
      setNote("");
      setRating(4);
      setTags(new Set());
      setPhotos([]);
      setDone(false);
      setDraftUuid(Crypto.randomUUID());
      sheetRef.current?.snapToIndex(0);
    } else {
      sheetRef.current?.close();
    }
  }, [visible]);

  const snapPoints = useMemo(() => ["75%", "92%"], []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.45}
        pressBehavior="close"
      />
    ),
    [],
  );

  const toggleTag = (slug: string) => {
    const next = new Set(tags);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setTags(next);
  };

  const onAddPhoto = async (source: "camera" | "library") => {
    if (!draftUuid) return;
    try {
      const filename = await pickAndStorePhoto(draftUuid, source);
      if (filename) setPhotos((p) => [...p, filename]);
    } catch (err) {
      Alert.alert("Ошибка", err instanceof Error ? err.message : "photo-failed");
    }
  };

  const onRemovePhoto = async (filename: string) => {
    if (!draftUuid) return;
    setPhotos((p) => p.filter((f) => f !== filename));
    await deletePhotoFile(draftUuid, filename);
  };

  const onSave = async () => {
    if (!effectiveCoords) {
      Alert.alert("Нет координат", "Подожди GPS-фикса или коснись карты длительно.");
      return;
    }
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    setBusy(true);
    try {
      await add({
        client_uuid: draftUuid ?? undefined,
        lat: effectiveCoords.lat,
        lon: effectiveCoords.lon,
        name: name.trim() || null,
        note: note.trim() || null,
        rating,
        tags: Array.from(tags),
        photos,
      });
      // Успех — НЕ закрываем sheet, показываем done-state.
      setDone(true);
    } catch (err) {
      Alert.alert("Ошибка", err instanceof Error ? err.message : "save-failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handle}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
    >
      <BottomSheetScrollView contentContainerStyle={styles.content}>
        {done ? (
          <View>
            <Text style={styles.title}>Сохранено</Text>
            <Text style={styles.doneName}>{name.trim() || "Место"}</Text>
            <View style={styles.actions}>
              <Pressable style={styles.btnSecondary} onPress={onClose}>
                {/* TODO(nav): deep-link to «Мои места» tab — deferred v1 */}
                <Text style={styles.btnSecondaryText}>Мои места</Text>
              </Pressable>
              <Pressable style={styles.btnPrimary} onPress={onClose}>
                <Text style={styles.btnPrimaryText}>Готово</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
        <Text style={styles.title}>Сохранить спот</Text>

        {effectiveCoords ? (
          <Text style={styles.coords}>
            {effectiveCoords.lat.toFixed(5)}, {effectiveCoords.lon.toFixed(5)}
            {coords ? " · точка тапа" : fix?.accuracy != null
              ? ` · ±${Math.round(fix.accuracy)} м (GPS)`
              : ""}
          </Text>
        ) : (
          <Text style={styles.coordsWarn}>
            GPS ещё не пришёл — нажми длительно на карту, чтобы выбрать точку.
          </Text>
        )}

        <Text style={styles.label}>Название</Text>
        <BottomSheetTextInput
          style={[styles.input, nameError && styles.inputError]}
          placeholder="Поляна с боровиками…"
          placeholderTextColor={palette.light.inkDim}
          value={name}
          onChangeText={(t) => {
            setName(t);
            if (nameError) setNameError(false);
          }}
          maxLength={100}
        />
        {nameError ? (
          <Text style={styles.errorHint}>Введите название</Text>
        ) : null}

        <Text style={styles.label}>Заметка</Text>
        <BottomSheetTextInput
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

        <Text style={styles.label}>Фото</Text>
        <View style={styles.photosRow}>
          {photos.map((filename) =>
            draftUuid ? (
              <Pressable
                key={filename}
                onLongPress={() => onRemovePhoto(filename)}
              >
                <Image
                  source={{ uri: photoUri(draftUuid, filename) }}
                  style={styles.photoThumb}
                />
              </Pressable>
            ) : null,
          )}
          <Pressable
            style={styles.photoAddBtn}
            onPress={() => onAddPhoto("camera")}
          >
            <Text style={styles.photoAddText}>Камера</Text>
          </Pressable>
          <Pressable
            style={styles.photoAddBtn}
            onPress={() => onAddPhoto("library")}
          >
            <Text style={styles.photoAddText}>Галерея</Text>
          </Pressable>
        </View>
        {photos.length > 0 ? (
          <Text style={styles.photoHint}>
            долгое нажатие на превью — удалить
          </Text>
        ) : null}

        {tagGroups.map((group) => (
          <View key={group.title}>
            <Text style={styles.label}>{group.title}</Text>
            <View style={styles.tagsRow}>
              {group.tags.map((tag) => (
                <Pressable
                  key={tag.slug}
                  style={[
                    styles.tagChip,
                    tags.has(tag.slug) && styles.tagChipActive,
                  ]}
                  onPress={() => toggleTag(tag.slug)}
                >
                  <Text
                    style={[
                      styles.tagChipText,
                      tags.has(tag.slug) && styles.tagChipTextActive,
                    ]}
                  >
                    {tag.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.actions}>
          <Pressable style={styles.btnSecondary} onPress={onClose}>
            <Text style={styles.btnSecondaryText}>Отмена</Text>
          </Pressable>
          <Pressable
            style={[
              styles.btnPrimary,
              (!effectiveCoords || busy) && styles.btnDisabled,
            ]}
            disabled={!effectiveCoords || busy}
            onPress={onSave}
          >
            <Text style={styles.btnPrimaryText}>
              {busy ? "Сохраняю…" : "Сохранить"}
            </Text>
          </Pressable>
        </View>
          </>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: palette.light.paper,
  },
  handle: {
    backgroundColor: palette.light.rule,
    width: 40,
    height: 4,
  },
  content: {
    padding: spacing[5],
    paddingTop: spacing[3],
    paddingBottom: spacing[7],
  },
  title: {
    fontSize: fontSize.h2,
    color: palette.light.ink,
    marginBottom: spacing[3],
  },
  doneName: {
    fontSize: fontSize.body,
    color: palette.light.ink,
    marginBottom: spacing[5],
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
  inputError: {
    borderColor: palette.light.danger,
    borderWidth: 1,
  },
  errorHint: {
    fontSize: fontSize.sm,
    color: palette.light.danger,
    marginTop: spacing[2],
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
  photosRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
  },
  photoThumb: {
    width: 76,
    height: 76,
    borderRadius: radius.sm,
    backgroundColor: palette.light.paperRise,
  },
  photoAddBtn: {
    width: 76,
    height: 76,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.light.rule,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.light.paperRise,
  },
  photoAddText: {
    fontSize: fontSize.sm,
    color: palette.light.ink,
    fontWeight: "500",
  },
  photoHint: {
    fontSize: fontSize.xs,
    color: palette.light.inkDim,
    marginTop: spacing[1],
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
