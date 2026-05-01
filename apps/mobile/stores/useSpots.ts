import { create } from "zustand";
import {
  type LocalSpot,
  type CreateSpotInput,
  type UpdateSpotInput,
  createSpot,
  listSpots,
  softDeleteSpot,
  updateSpot,
} from "../services/spotsRepo";

type SpotsState = {
  spots: LocalSpot[];
  loaded: boolean;
  error: string | null;

  load: () => Promise<void>;
  add: (input: CreateSpotInput) => Promise<LocalSpot>;
  edit: (input: UpdateSpotInput) => Promise<LocalSpot>;
  remove: (uuid: string) => Promise<void>;
};

export const useSpots = create<SpotsState>((set, get) => ({
  spots: [],
  loaded: false,
  error: null,

  load: async () => {
    try {
      const spots = await listSpots();
      set({ spots, loaded: true, error: null });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "load-error" });
    }
  },

  add: async (input) => {
    const spot = await createSpot(input);
    set({ spots: [spot, ...get().spots] });
    return spot;
  },

  edit: async (input) => {
    const updated = await updateSpot(input);
    set({
      spots: get().spots.map((s) =>
        s.client_uuid === updated.client_uuid ? updated : s,
      ),
    });
    return updated;
  },

  remove: async (uuid) => {
    await softDeleteSpot(uuid);
    set({ spots: get().spots.filter((s) => s.client_uuid !== uuid) });
  },
}));
