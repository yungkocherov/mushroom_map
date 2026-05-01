import * as Crypto from "expo-crypto";
import { getDb } from "./db";

export type LocalSpot = {
  client_uuid: string;
  server_id: number | null;
  lat: number;
  lon: number;
  name: string | null;
  note: string | null;
  rating: number | null;
  tags: string[];
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  sync_state: "pending" | "synced" | "conflict";
};

type Row = Omit<LocalSpot, "tags"> & { tags: string };

function rowToSpot(row: Row): LocalSpot {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(row.tags);
    if (Array.isArray(parsed)) tags = parsed.filter((t) => typeof t === "string");
  } catch {
    tags = [];
  }
  return {
    ...row,
    tags,
  };
}

export type CreateSpotInput = {
  lat: number;
  lon: number;
  name?: string | null;
  note?: string | null;
  rating?: number | null;
  tags?: string[];
};

function randomUuid(): string {
  return Crypto.randomUUID();
}

export async function createSpot(input: CreateSpotInput): Promise<LocalSpot> {
  const db = await getDb();
  const now = Date.now();
  const uuid = randomUuid();
  const tagsJson = JSON.stringify(input.tags ?? []);

  await db.runAsync(
    `INSERT INTO local_spot
      (client_uuid, lat, lon, name, note, rating, tags, created_at, updated_at, sync_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      uuid,
      input.lat,
      input.lon,
      input.name ?? null,
      input.note ?? null,
      input.rating ?? null,
      tagsJson,
      now,
      now,
    ],
  );
  const row = await db.getFirstAsync<Row>(
    "SELECT * FROM local_spot WHERE client_uuid = ?",
    [uuid],
  );
  if (!row) throw new Error("inserted spot disappeared");
  return rowToSpot(row);
}

export async function listSpots(): Promise<LocalSpot[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(
    "SELECT * FROM local_spot WHERE deleted_at IS NULL ORDER BY created_at DESC",
  );
  return rows.map(rowToSpot);
}

export async function getSpot(uuid: string): Promise<LocalSpot | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Row>(
    "SELECT * FROM local_spot WHERE client_uuid = ?",
    [uuid],
  );
  return row ? rowToSpot(row) : null;
}

export type UpdateSpotInput = Partial<CreateSpotInput> & {
  client_uuid: string;
};

export async function updateSpot(input: UpdateSpotInput): Promise<LocalSpot> {
  const db = await getDb();
  const now = Date.now();
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  const map: Record<keyof CreateSpotInput, string> = {
    lat: "lat",
    lon: "lon",
    name: "name",
    note: "note",
    rating: "rating",
    tags: "tags",
  };
  for (const k of Object.keys(map) as (keyof CreateSpotInput)[]) {
    if (input[k] !== undefined) {
      sets.push(`${map[k]} = ?`);
      values.push(k === "tags" ? JSON.stringify(input.tags ?? []) : (input[k] as never));
    }
  }
  if (sets.length === 0) {
    const existing = await getSpot(input.client_uuid);
    if (!existing) throw new Error("spot not found");
    return existing;
  }
  sets.push("updated_at = ?");
  sets.push("sync_state = 'pending'");
  values.push(now);
  values.push(input.client_uuid);

  await db.runAsync(
    `UPDATE local_spot SET ${sets.join(", ")} WHERE client_uuid = ?`,
    values,
  );
  const updated = await getSpot(input.client_uuid);
  if (!updated) throw new Error("spot not found after update");
  return updated;
}

export async function softDeleteSpot(uuid: string): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.runAsync(
    "UPDATE local_spot SET deleted_at = ?, updated_at = ?, sync_state = 'pending' WHERE client_uuid = ?",
    [now, now, uuid],
  );
}

export async function listPendingForSync(): Promise<LocalSpot[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(
    "SELECT * FROM local_spot WHERE sync_state != 'synced' ORDER BY updated_at ASC",
  );
  return rows.map(rowToSpot);
}

export async function markSynced(uuid: string, serverId: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE local_spot SET sync_state = 'synced', server_id = ? WHERE client_uuid = ?",
    [serverId, uuid],
  );
}
