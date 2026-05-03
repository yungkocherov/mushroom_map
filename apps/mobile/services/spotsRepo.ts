import * as Crypto from "expo-crypto";
import { getDb } from "./db";
import { deleteSpotPhotosDir } from "./spotPhotos";

export type LocalSpot = {
  client_uuid: string;
  server_id: number | null;
  lat: number;
  lon: number;
  name: string | null;
  note: string | null;
  rating: number | null;
  tags: string[];
  /** Имена файлов внутри documentDirectory/spot-photos/{client_uuid}/ */
  photos: string[];
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  sync_state: "pending" | "synced" | "conflict";
};

type Row = Omit<LocalSpot, "tags" | "photos"> & {
  tags: string;
  photos: string | null;
};

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is string => typeof t === "string");
    }
  } catch {
    // fall through
  }
  return [];
}

function rowToSpot(row: Row): LocalSpot {
  return {
    ...row,
    tags: parseStringArray(row.tags),
    photos: parseStringArray(row.photos),
  };
}

export type CreateSpotInput = {
  lat: number;
  lon: number;
  name?: string | null;
  note?: string | null;
  rating?: number | null;
  tags?: string[];
  photos?: string[];
  /**
   * Если задан — будет использован как client_uuid вместо случайного.
   * Полезно для случаев когда uuid нужен ДО save'а (например, фото
   * сохраняются в spot-photos/{uuid}/ ещё до создания строки).
   */
  client_uuid?: string;
};

function randomUuid(): string {
  return Crypto.randomUUID();
}

export async function createSpot(input: CreateSpotInput): Promise<LocalSpot> {
  const db = await getDb();
  const now = Date.now();
  const uuid = input.client_uuid ?? randomUuid();
  const tagsJson = JSON.stringify(input.tags ?? []);

  const photosJson = JSON.stringify(input.photos ?? []);
  await db.runAsync(
    `INSERT INTO local_spot
      (client_uuid, lat, lon, name, note, rating, tags, photos,
       created_at, updated_at, sync_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      uuid,
      input.lat,
      input.lon,
      input.name ?? null,
      input.note ?? null,
      input.rating ?? null,
      tagsJson,
      photosJson,
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
  // client_uuid не апдейтится (PK).
  type UpdatableField = Exclude<keyof CreateSpotInput, "client_uuid">;
  const map: Record<UpdatableField, string> = {
    lat: "lat",
    lon: "lon",
    name: "name",
    note: "note",
    rating: "rating",
    tags: "tags",
    photos: "photos",
  };
  for (const k of Object.keys(map) as UpdatableField[]) {
    if (input[k] !== undefined) {
      sets.push(`${map[k]} = ?`);
      if (k === "tags" || k === "photos") {
        values.push(JSON.stringify((input[k] as string[] | undefined) ?? []));
      } else {
        values.push(input[k] as never);
      }
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
  // Best-effort: чистим папку с фото. Если sync с сервером ещё не
  // прошёл и фото там — это поведение мы примем как acceptable: фото
  // лежат локально и будут потеряны (server-side photos sync — Phase 6+).
  await deleteSpotPhotosDir(uuid);
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
