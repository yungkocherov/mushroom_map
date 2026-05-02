import { create } from "zustand";
import { getDb } from "../services/db";

const KEY = "onboarding.completed.v1";

type State = {
  /** null = ещё не подгружен из БД, false = ещё не прошёл, true = прошёл. */
  completed: boolean | null;
  load: () => Promise<void>;
  markDone: () => Promise<void>;
};

export const useOnboarding = create<State>((set) => ({
  completed: null,
  load: async () => {
    const db = await getDb();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM sync_meta WHERE key = ?",
      [KEY],
    );
    set({ completed: row?.value === "1" });
  },
  markDone: async () => {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO sync_meta (key, value) VALUES (?, '1')
       ON CONFLICT(key) DO UPDATE SET value = '1'`,
      [KEY],
    );
    set({ completed: true });
  },
}));
