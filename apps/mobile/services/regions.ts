import * as FileSystem from "expo-file-system";
import * as Crypto from "expo-crypto";
import { apiRequest } from "./api";
import { getDb } from "./db";

export type RegionLayer = {
  name: string;
  url: string;
  size_bytes: number;
  sha256: string;
};

export type Region = {
  slug: string;
  name: string;
  bbox: [number, number, number, number]; // [south, west, north, east]
  layers: RegionLayer[];
  total_size_bytes: number;
  manifest_version: string;
};

export type RegionsResponse = {
  version: string;
  base_url: string;
  regions: Region[];
};

export type RegionDownloadProgress = {
  slug: string;
  layer: string;
  bytes_done: number;
  bytes_total: number;
};

export type DownloadResult =
  | { kind: "ok" }
  | { kind: "error"; message: string }
  | { kind: "cancelled" };

const TILES_ROOT = `${FileSystem.documentDirectory}geobiom-tiles/`;

/** Path внутри устройства где лежит конкретный layer региона. */
export function getLayerLocalUri(slug: string, layer: string): string {
  return `${TILES_ROOT}${slug}/${layer}.pmtiles`;
}

/** Path до root каталога региона. */
function getRegionDir(slug: string): string {
  return `${TILES_ROOT}${slug}/`;
}

async function ensureRootExists(): Promise<void> {
  const info = await FileSystem.getInfoAsync(TILES_ROOT);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(TILES_ROOT, { intermediates: true });
  }
}

/** GET /api/mobile/regions — список доступных регионов от backend. */
export async function fetchRegions(): Promise<RegionsResponse> {
  return apiRequest<RegionsResponse>("/api/mobile/regions", { auth: false });
}

/** Read state of all downloaded regions from SQLite. */
export async function listDownloadedSlugs(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string }>(
    "SELECT key FROM sync_meta WHERE key LIKE 'region.%.installed'",
  );
  return new Set(
    rows
      .map((r) => r.key.replace(/^region\./, "").replace(/\.installed$/, ""))
      .filter(Boolean),
  );
}

async function recordRegionInstalled(slug: string, version: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO sync_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [`region.${slug}.installed`, version],
  );
}

async function clearRegionInstalled(slug: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "DELETE FROM sync_meta WHERE key = ?",
    [`region.${slug}.installed`],
  );
}

/** Get installed manifest_version for a region. NULL if not downloaded. */
export async function getInstalledVersion(slug: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM sync_meta WHERE key = ?",
    [`region.${slug}.installed`],
  );
  return row?.value ?? null;
}

const B64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

let _b64Lut: Int16Array | null = null;
function b64Lut(): Int16Array {
  if (_b64Lut) return _b64Lut;
  const lut = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64_ALPHABET.length; i++) {
    lut[B64_ALPHABET.charCodeAt(i)] = i;
  }
  _b64Lut = lut;
  return lut;
}

/**
 * Decode a standard base64 string to raw bytes. Dependency-free and does
 * NOT rely on `atob`/`Buffer` globals (RN/Hermes availability varies).
 * expo-file-system Base64 output has no line breaks; `\s` strip is a
 * cheap defensive no-op.
 */
function base64ToBytes(b64: string): Uint8Array {
  const s = b64.replace(/\s/g, "");
  const len = s.length;
  if (len === 0) return new Uint8Array(0);
  const pad = s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0;
  const out = new Uint8Array((len / 4) * 3 - pad);
  const lut = b64Lut();
  let o = 0;
  for (let i = 0; i < len; i += 4) {
    const a = lut[s.charCodeAt(i)];
    const b = lut[s.charCodeAt(i + 1)];
    const c = lut[s.charCodeAt(i + 2)]; // -1 when '='
    const d = lut[s.charCodeAt(i + 3)]; // -1 when '='
    const n = (a << 18) | (b << 12) | ((c & 63) << 6) | (d & 63);
    out[o++] = (n >> 16) & 0xff;
    if (c !== -1) out[o++] = (n >> 8) & 0xff;
    if (d !== -1) out[o++] = n & 0xff;
  }
  return out;
}

async function sha256File(uri: string): Promise<string> {
  // ВАЖНО: хешируем РАW-БИНАРЬ файла, не base64-текст. Сервер в
  // манифесте отдаёт SHA256 поверх бинарника pmtiles; раньше тут было
  // digestStringAsync(SHA256, base64) — это хеш UTF-8-байт base64-
  // СТРОКИ, он никогда не совпадал → любой регион не скачивался.
  // expo-file-system читает только UTF8/Base64 → читаем base64,
  // декодируем в байты, хешируем байты через Crypto.digest (binary).
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToBytes(base64);
  const buf = await Crypto.digest(
    Crypto.CryptoDigestAlgorithm.SHA256,
    bytes,
  );
  const view = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < view.length; i++) {
    hex += view[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Cancel-token: vending the active downloadResumable per slug чтобы
 * cancelAsync() мог быть вызван снаружи. Cancel'нутый file partial
 * не удаляется expo-file-system, но downloadRegion удаляет .partial
 * на error/cancel.
 */
const inflight = new Map<string, FileSystem.DownloadResumable>();

export function isInflight(slug: string): boolean {
  return inflight.has(slug);
}

export async function cancelDownload(slug: string): Promise<void> {
  const dl = inflight.get(slug);
  if (!dl) return;
  try {
    await dl.cancelAsync();
  } catch {
    // already cancelled or finished — ignore
  }
  inflight.delete(slug);
}

/**
 * Download all layer files of a region. Verifies sha256 of each.
 * Records `region.<slug>.installed = manifest_version` in sync_meta on
 * success.
 *
 * onProgress called frequently (~every 256 KB) — debounce in caller if
 * needed for UI re-renders.
 *
 * Cancel: вызвать `cancelDownload(slug)` из любого места — текущий
 * layer.downloadAsync() вернёт null, downloadRegion увидит и вернёт
 * { kind: 'cancelled' }.
 */
export async function downloadRegion(
  region: Region,
  onProgress: (p: RegionDownloadProgress) => void,
  signal?: AbortSignal,
): Promise<DownloadResult> {
  await ensureRootExists();
  await FileSystem.makeDirectoryAsync(getRegionDir(region.slug), {
    intermediates: true,
  });

  for (const layer of region.layers) {
    if (signal?.aborted) {
      inflight.delete(region.slug);
      return { kind: "cancelled" };
    }

    const dst = getLayerLocalUri(region.slug, layer.name);
    const tmp = `${dst}.partial`;

    let lastBytes = 0;
    const dl = FileSystem.createDownloadResumable(
      layer.url,
      tmp,
      {},
      (p) => {
        const delta = p.totalBytesWritten - lastBytes;
        if (delta < 256 * 1024 && p.totalBytesWritten < layer.size_bytes) return;
        lastBytes = p.totalBytesWritten;
        onProgress({
          slug: region.slug,
          layer: layer.name,
          bytes_done: p.totalBytesWritten,
          bytes_total: layer.size_bytes,
        });
      },
    );
    inflight.set(region.slug, dl);

    let result;
    try {
      result = await dl.downloadAsync();
    } catch (err) {
      inflight.delete(region.slug);
      // expo-file-system throws при cancelAsync()
      const msg = err instanceof Error ? err.message : "unknown";
      if (/cancel|abort/i.test(msg)) {
        await FileSystem.deleteAsync(tmp, { idempotent: true });
        return { kind: "cancelled" };
      }
      return {
        kind: "error",
        message: `download ${layer.name}: ${msg}`,
      };
    }
    if (!result || !result.uri) {
      inflight.delete(region.slug);
      return { kind: "cancelled" };
    }
    if (signal?.aborted) {
      inflight.delete(region.slug);
      await FileSystem.deleteAsync(tmp, { idempotent: true });
      return { kind: "cancelled" };
    }

    // Verify sha256
    let actualSha;
    try {
      actualSha = await sha256File(tmp);
    } catch (err) {
      return {
        kind: "error",
        message: `sha256 ${layer.name}: ${err instanceof Error ? err.message : "fail"}`,
      };
    }
    if (actualSha !== layer.sha256) {
      await FileSystem.deleteAsync(tmp, { idempotent: true });
      return {
        kind: "error",
        message: `sha256 mismatch on ${layer.name} (got ${actualSha.slice(0, 12)}…)`,
      };
    }

    // Atomic move into final position
    await FileSystem.moveAsync({ from: tmp, to: dst });
    onProgress({
      slug: region.slug,
      layer: layer.name,
      bytes_done: layer.size_bytes,
      bytes_total: layer.size_bytes,
    });
  }

  await recordRegionInstalled(region.slug, region.manifest_version);
  inflight.delete(region.slug);
  return { kind: "ok" };
}

/** Удалить все файлы региона + запись в sync_meta. */
export async function deleteRegion(slug: string): Promise<void> {
  const dir = getRegionDir(slug);
  const info = await FileSystem.getInfoAsync(dir);
  if (info.exists) {
    await FileSystem.deleteAsync(dir, { idempotent: true });
  }
  await clearRegionInstalled(slug);
}

/**
 * Compute total disk usage across all downloaded regions.
 * Used in Settings → Регионы footer «Использовано: X МБ».
 */
export async function getTotalDownloadedBytes(): Promise<number> {
  const slugs = await listDownloadedSlugs();
  let total = 0;
  for (const slug of slugs) {
    const dir = getRegionDir(slug);
    const info = await FileSystem.getInfoAsync(dir, { size: true });
    if (info.exists && "size" in info && typeof info.size === "number") {
      total += info.size;
    }
  }
  return total;
}
