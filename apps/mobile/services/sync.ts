import NetInfo from "@react-native-community/netinfo";
import {
  type LocalSpot,
  listPendingForSync,
  markSynced,
} from "./spotsRepo";
import { ApiError, apiRequest, getDeviceToken } from "./api";
import { getDb } from "./db";

const LAST_SYNC_KEY = "last_sync_at";
const DEVICE_ID_KEY = "geobiom.device_id.v1";

let inflight: Promise<SyncOutcome> | null = null;
let lastSyncAttempt = 0;
const MIN_SYNC_INTERVAL_MS = 30_000; // debounce, см. mobile-app-2026-05.md

export type SyncOutcome =
  | { kind: "ok"; pulled: number; pushed: number }
  | { kind: "skipped"; reason: string }
  | { kind: "error"; message: string };

type SyncOpRequest = {
  client_uuid: string;
  op: "create" | "update" | "delete";
  lat?: number;
  lon?: number;
  name?: string | null;
  note?: string | null;
  rating?: number | null;
  tags?: string[];
  client_updated_at: number;
};

type SyncResponse = {
  server_changes: Array<{
    client_uuid: string | null;
    server_id: string;
    op: "upsert" | "delete";
    lat?: number;
    lon?: number;
    name?: string | null;
    note?: string | null;
    rating?: number | null;
    tags?: string[] | null;
    server_updated_at: number;
  }>;
  ack: Array<{
    client_uuid: string;
    server_id?: string;
    status: "ok" | "conflict" | "error";
    error?: string;
  }>;
  server_now: number;
};

function spotToOp(spot: LocalSpot): SyncOpRequest {
  if (spot.deleted_at) {
    return {
      client_uuid: spot.client_uuid,
      op: "delete",
      client_updated_at: spot.updated_at,
    };
  }
  return {
    client_uuid: spot.client_uuid,
    op: spot.server_id == null ? "create" : "update",
    lat: spot.lat,
    lon: spot.lon,
    name: spot.name,
    note: spot.note,
    rating: spot.rating,
    tags: spot.tags,
    client_updated_at: spot.updated_at,
  };
}

async function getMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM sync_meta WHERE key = ?",
    [key],
  );
  return row?.value ?? null;
}

async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO sync_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

async function applyServerChanges(
  changes: SyncResponse["server_changes"],
): Promise<number> {
  if (changes.length === 0) return 0;
  const db = await getDb();
  let applied = 0;
  for (const ch of changes) {
    if (!ch.client_uuid) {
      // Spot создан в web без client_uuid — пропускаем; web-only spots
      // не появляются в mobile до миграции web-флоу на client_uuid
      // (Phase 2). См. docs/mobile-app-2026-05.md, контракт sync.
      continue;
    }
    if (ch.op === "delete") {
      await db.runAsync(
        `UPDATE local_spot SET deleted_at = ?, updated_at = ?, sync_state = 'synced'
         WHERE client_uuid = ?`,
        [ch.server_updated_at, ch.server_updated_at, ch.client_uuid],
      );
    } else {
      await db.runAsync(
        `INSERT INTO local_spot
           (client_uuid, server_id, lat, lon, name, note, rating, tags,
            created_at, updated_at, sync_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
         ON CONFLICT(client_uuid) DO UPDATE SET
           server_id = excluded.server_id,
           lat = excluded.lat,
           lon = excluded.lon,
           name = excluded.name,
           note = excluded.note,
           rating = excluded.rating,
           tags = excluded.tags,
           updated_at = excluded.updated_at,
           sync_state = 'synced'
         WHERE local_spot.updated_at < excluded.updated_at`,
        [
          ch.client_uuid,
          parseInt(ch.server_id, 10) || null,
          ch.lat ?? 0,
          ch.lon ?? 0,
          ch.name ?? null,
          ch.note ?? null,
          ch.rating ?? null,
          JSON.stringify(ch.tags ?? []),
          ch.server_updated_at,
          ch.server_updated_at,
        ],
      );
    }
    applied++;
  }
  return applied;
}

/**
 * Bulk-sync с сервером. Idempotent — можно дёргать сколько угодно. Сам
 * себя дебаунсит: повторный вызов в течение MIN_SYNC_INTERVAL_MS
 * возвращает «skipped».
 */
export async function syncSpots(
  opts: { force?: boolean } = {},
): Promise<SyncOutcome> {
  const now = Date.now();
  if (!opts.force && now - lastSyncAttempt < MIN_SYNC_INTERVAL_MS) {
    return { kind: "skipped", reason: "debounce" };
  }
  lastSyncAttempt = now;

  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const token = await getDeviceToken();
      if (!token) return { kind: "skipped", reason: "not-logged-in" };

      const net = await NetInfo.fetch();
      if (!net.isConnected) return { kind: "skipped", reason: "offline" };

      const pending = await listPendingForSync();
      const lastSync = parseInt((await getMeta(LAST_SYNC_KEY)) ?? "0", 10);
      const deviceId = (await getMeta(DEVICE_ID_KEY)) ?? "device-unknown";

      const response = await apiRequest<SyncResponse>("/api/mobile/spots/sync", {
        method: "POST",
        body: {
          device_id: deviceId,
          last_sync_at: lastSync,
          client_changes: pending.map(spotToOp),
        },
      });

      let pushed = 0;
      for (const a of response.ack) {
        if (a.status === "ok" && a.server_id) {
          await markSynced(a.client_uuid, parseInt(a.server_id, 10));
          pushed++;
        }
      }
      const pulled = await applyServerChanges(response.server_changes);
      await setMeta(LAST_SYNC_KEY, String(response.server_now));

      return { kind: "ok", pulled, pushed };
    } catch (err) {
      if (err instanceof ApiError) {
        return { kind: "error", message: `API ${err.status}: ${err.message}` };
      }
      return {
        kind: "error",
        message: err instanceof Error ? err.message : "sync-failed",
      };
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Подписаться на смену сетевого состояния — триггерит sync при
 * offline → online. Вызывать один раз из root layout.
 */
export function startSyncListener(): () => void {
  let prev = false;
  const sub = NetInfo.addEventListener((state) => {
    const online = !!state.isConnected;
    if (online && !prev) {
      void syncSpots({ force: true });
    }
    prev = online;
  });
  return sub;
}
