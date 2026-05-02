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

async function sha256File(uri: string): Promise<string> {
  // expo-crypto digestStringAsync принимает строку. Для бинарника
  // читаем base64 и считаем SHA256 поверх. Для больших файлов это
  // создаёт строку в памяти — приемлемо до ~100 МБ. Для типичного
  // региона ~30-70 МБ ОК.
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    base64,
    { encoding: Crypto.CryptoEncoding.HEX },
  );
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
