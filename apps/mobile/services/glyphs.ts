import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";

/**
 * Bundled PBF-glyphs (sdf-шрифты для symbol-layer'ов в style.ts).
 * 3 fontstack'а × 6 ranges = 18 файлов, всего ~1.8 МБ. Лежат в
 * `apps/mobile/assets/glyphs/{fontstack}/{range}.pbf` и попадают в APK
 * через `metro.config.js: assetExts += 'pbf'`.
 *
 * MapLibre Native не даёт substitute'ить per-file URL — нужен URL
 * pattern с `{fontstack}/{range}.pbf`. Asset.fromModule даёт localUri
 * для каждого файла, но они не лежат рядом друг с другом
 * (Expo asset cache имеет content-hashed имена). Поэтому при первом
 * старте копируем все 18 PBF в `documentDirectory/glyphs/{fontstack}/{range}.pbf`,
 * потом возвращаем base URI для подстановки в style.glyphs.
 *
 * Online fallback — пока копирование не завершилось (или невозможно)
 * style.ts использует https://api.geobiom.ru/glyphs/. На physical
 * device первый старт занимает ~200-400 мс на копирование 1.8 МБ —
 * приемлемо.
 */

// require()-нные модули попадают в bundle. Каждый файл = один Asset.
// Жестко перечисляем все 18 — Metro не умеет dynamic require'ы.
const GLYPH_MODULES: Record<string, Record<string, number>> = {
  "Noto Sans Regular": {
    "0-255":     require("../assets/glyphs/Noto Sans Regular/0-255.pbf"),
    "256-511":   require("../assets/glyphs/Noto Sans Regular/256-511.pbf"),
    "512-767":   require("../assets/glyphs/Noto Sans Regular/512-767.pbf"),
    "768-1023":  require("../assets/glyphs/Noto Sans Regular/768-1023.pbf"),
    "1024-1279": require("../assets/glyphs/Noto Sans Regular/1024-1279.pbf"),
    "1280-1535": require("../assets/glyphs/Noto Sans Regular/1280-1535.pbf"),
  },
  "Noto Sans Bold": {
    "0-255":     require("../assets/glyphs/Noto Sans Bold/0-255.pbf"),
    "256-511":   require("../assets/glyphs/Noto Sans Bold/256-511.pbf"),
    "512-767":   require("../assets/glyphs/Noto Sans Bold/512-767.pbf"),
    "768-1023":  require("../assets/glyphs/Noto Sans Bold/768-1023.pbf"),
    "1024-1279": require("../assets/glyphs/Noto Sans Bold/1024-1279.pbf"),
    "1280-1535": require("../assets/glyphs/Noto Sans Bold/1280-1535.pbf"),
  },
  "Noto Sans Italic": {
    "0-255":     require("../assets/glyphs/Noto Sans Italic/0-255.pbf"),
    "256-511":   require("../assets/glyphs/Noto Sans Italic/256-511.pbf"),
    "512-767":   require("../assets/glyphs/Noto Sans Italic/512-767.pbf"),
    "768-1023":  require("../assets/glyphs/Noto Sans Italic/768-1023.pbf"),
    "1024-1279": require("../assets/glyphs/Noto Sans Italic/1024-1279.pbf"),
    "1280-1535": require("../assets/glyphs/Noto Sans Italic/1280-1535.pbf"),
  },
};

function rootDir(): string {
  const doc = FileSystem.documentDirectory;
  if (!doc) throw new Error("documentDirectory unavailable");
  return `${doc}glyphs`;
}

async function ensureDir(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

let cachedBaseUri: string | null = null;
let extractInFlight: Promise<string> | null = null;

/**
 * One-shot extract. На втором вызове отдаёт cached путь без I/O.
 * Idempotent: проверяет существование каждого файла перед copy.
 *
 * Возвращает base URI вида `file:///data/.../glyphs` (без trailing /).
 */
export async function ensureGlyphsExtracted(): Promise<string> {
  if (cachedBaseUri) return cachedBaseUri;
  if (extractInFlight) return extractInFlight;

  extractInFlight = (async () => {
    const base = rootDir();
    await ensureDir(base);

    for (const [fontstack, ranges] of Object.entries(GLYPH_MODULES)) {
      const fontDir = `${base}/${fontstack}`;
      await ensureDir(fontDir);

      for (const [range, mod] of Object.entries(ranges)) {
        const dest = `${fontDir}/${range}.pbf`;
        const info = await FileSystem.getInfoAsync(dest);
        if (info.exists && info.size && info.size > 0) continue;

        const asset = Asset.fromModule(mod);
        await asset.downloadAsync();
        if (!asset.localUri) {
          throw new Error(`glyph asset has no localUri: ${fontstack}/${range}`);
        }
        await FileSystem.copyAsync({ from: asset.localUri, to: dest });
      }
    }

    cachedBaseUri = `file://${base}`;
    return cachedBaseUri;
  })();

  try {
    return await extractInFlight;
  } finally {
    extractInFlight = null;
  }
}

/** URL-pattern для style.glyphs. Только если ensureGlyphsExtracted() выполнен. */
export function glyphsUrlPattern(baseUri: string): string {
  return `${baseUri}/{fontstack}/{range}.pbf`;
}
