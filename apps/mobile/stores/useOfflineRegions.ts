import { create } from "zustand";
import {
  type Region,
  type RegionDownloadProgress,
  type DownloadResult,
  fetchRegions,
  listDownloadedSlugs,
  downloadRegion as fsDownloadRegion,
  deleteRegion as fsDeleteRegion,
  cancelDownload as fsCancelDownload,
  getInstalledVersion,
} from "../services/regions";

type DownloadState = {
  layer: string;
  bytes_done: number;
  bytes_total: number;
};

type OfflineRegionsState = {
  available: Region[]; // от API /api/mobile/regions
  downloaded: Set<string>; // slugs
  /** Slugs которые скачаны со старой manifest_version (server обновился). */
  outdated: Set<string>;
  inProgress: Record<string, DownloadState>; // slug -> current layer download
  manifestVersion: string;
  error: string | null;
  loading: boolean;

  refresh: () => Promise<void>;
  startDownload: (slug: string) => Promise<DownloadResult>;
  cancel: (slug: string) => Promise<void>;
  remove: (slug: string) => Promise<void>;
};

export const useOfflineRegions = create<OfflineRegionsState>((set, get) => ({
  available: [],
  downloaded: new Set(),
  outdated: new Set(),
  inProgress: {},
  manifestVersion: "",
  error: null,
  loading: false,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const [resp, downloaded] = await Promise.all([
        fetchRegions(),
        listDownloadedSlugs(),
      ]);
      // Detect outdated: regions which we have локально, но
      // manifest_version отличается от server'ского.
      const outdated = new Set<string>();
      for (const slug of downloaded) {
        const installed = await getInstalledVersion(slug);
        const remote = resp.regions.find((r) => r.slug === slug)?.manifest_version;
        if (installed && remote && installed !== remote) {
          outdated.add(slug);
        }
      }
      set({
        available: resp.regions,
        manifestVersion: resp.version,
        downloaded,
        outdated,
        loading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "fetch-regions-failed",
        loading: false,
      });
    }
  },

  startDownload: async (slug) => {
    const region = get().available.find((r) => r.slug === slug);
    if (!region) {
      return { kind: "error", message: `region ${slug} not in available list` };
    }
    if (get().inProgress[slug]) {
      return { kind: "error", message: "already downloading" };
    }

    set({
      inProgress: {
        ...get().inProgress,
        [slug]: {
          layer: region.layers[0]?.name ?? "",
          bytes_done: 0,
          bytes_total: region.total_size_bytes,
        },
      },
    });

    const onProgress = (p: RegionDownloadProgress) => {
      set({
        inProgress: {
          ...get().inProgress,
          [slug]: {
            layer: p.layer,
            bytes_done: p.bytes_done,
            bytes_total: region.total_size_bytes,
          },
        },
      });
    };

    const result = await fsDownloadRegion(region, onProgress);

    // Снять inProgress
    const next = { ...get().inProgress };
    delete next[slug];

    if (result.kind === "ok") {
      const downloaded = new Set([...get().downloaded, slug]);
      const outdated = new Set(get().outdated);
      outdated.delete(slug);
      set({ inProgress: next, downloaded, outdated });
    } else {
      set({
        inProgress: next,
        error:
          result.kind === "error"
            ? `download ${slug}: ${result.message}`
            : null,
      });
    }
    return result;
  },

  cancel: async (slug) => {
    await fsCancelDownload(slug);
    const next = { ...get().inProgress };
    delete next[slug];
    set({ inProgress: next });
  },

  remove: async (slug) => {
    await fsDeleteRegion(slug);
    const downloaded = new Set(get().downloaded);
    downloaded.delete(slug);
    const outdated = new Set(get().outdated);
    outdated.delete(slug);
    set({ downloaded, outdated });
  },
}));
