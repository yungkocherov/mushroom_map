import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

/**
 * Фото-аттачменты к local_spot. Хранятся как файлы в
 * `documentDirectory/spot-photos/{client_uuid}/{filename}.jpg`. В БД
 * хранятся только имена файлов (relative) — массив строк в `photos`
 * column. Полный путь восстанавливается через `photoUri()`.
 *
 * Почему так: (1) JPEG-файлы могут быть 1-3 MB каждый — base64 в SQLite
 * раздул бы DB; (2) при удалении спота удаляем папку целиком — атомарно;
 * (3) FileSystem на Android идёт через app-private storage, при
 * uninstall'е чистится автоматически.
 *
 * Sync с сервером — Phase 6+. Пока local-only.
 */

const ROOT_PREFIX = "spot-photos";

function rootDir(): string {
  const doc = FileSystem.documentDirectory;
  if (!doc) throw new Error("documentDirectory unavailable");
  return `${doc}${ROOT_PREFIX}`;
}

function spotDir(uuid: string): string {
  return `${rootDir()}/${uuid}`;
}

export function photoUri(uuid: string, filename: string): string {
  return `${spotDir(uuid)}/${filename}`;
}

async function ensureDir(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

/**
 * Просит permissions, открывает picker (camera + library options),
 * копирует выбранный файл в `spotDir(uuid)/photo_{ts}.jpg`. Возвращает
 * имя файла (relative) для записи в БД, или null если юзер отменил.
 *
 * source: 'camera' открывает камеру, 'library' — галерею.
 */
export async function pickAndStorePhoto(
  uuid: string,
  source: "camera" | "library" = "library",
): Promise<string | null> {
  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      throw new Error("Доступ к камере не дан");
    }
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      throw new Error("Доступ к галерее не дан");
    }
  }

  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.7,
          exif: false,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.7,
          exif: false,
        });

  if (result.canceled || !result.assets?.[0]?.uri) return null;

  await ensureDir(spotDir(uuid));
  const ts = Date.now();
  const filename = `photo_${ts}.jpg`;
  const dest = photoUri(uuid, filename);
  await FileSystem.copyAsync({ from: result.assets[0].uri, to: dest });
  return filename;
}

/**
 * Удалить файл фото (best-effort). Используется когда юзер удаляет
 * фото в UI до сохранения, или при правке спота.
 */
export async function deletePhotoFile(
  uuid: string,
  filename: string,
): Promise<void> {
  try {
    await FileSystem.deleteAsync(photoUri(uuid, filename), {
      idempotent: true,
    });
  } catch {
    // ignore
  }
}

/**
 * Удалить всю папку spot'а — вызывается из spotsRepo.softDelete /
 * full-delete. Idempotent.
 */
export async function deleteSpotPhotosDir(uuid: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(spotDir(uuid), { idempotent: true });
  } catch {
    // ignore
  }
}
