import { create } from "zustand";
import {
  type Region,
  type RegionDownloadProgress,
  type DownloadResult,
  fetchRegions,
  listDownloadedSlugs,
  downloadRegion as fsDownloadRegion,
  deleteRegion as fsDeleteRegion,
} from "../services/regions";

type DownloadState = {
  layer: string;
  bytes_done: number;
  bytes_total: number;
};

type OfflineRegionsState = {
  available: Region[]; // от API /api/mobile/regions
  downloaded: Set<string>; // slugs
  inProgress: Record<string, DownloadState>; // slug -> current layer download
  manifestVersion: string;
  error: string | null;
  loading: boolean;

  refresh: () => Promise<void>;
  startDownload: (slug: string) => Promise<DownloadResult>;
  remove: (slug: string) => Promise<void>;
};

export const useOfflineRegions = create<OfflineRegionsState>((set, get) => ({
  available: [],
  downloaded: new Set(),
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
      set({
        available: resp.regions,
        manifestVersion: resp.version,
        downloaded,
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
      set({
        inProgress: next,
        downloaded: new Set([...get().downloaded, slug]),
      });
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

  remove: async (slug) => {
    await fsDeleteRegion(slug);
    const downloaded = new Set(get().downloaded);
    downloaded.delete(slug);
    set({ downloaded });
  },
}));
