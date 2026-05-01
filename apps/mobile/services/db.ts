import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

const DB_NAME = "geobiom.db";
const KEY_NAME = "geobiom.db.key.v1";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getOrCreateDbKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_NAME);
  if (existing) return existing;

  const bytes = await Crypto.getRandomBytesAsync(32);
  const key = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  await SecureStore.setItemAsync(KEY_NAME, key, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  return key;
}

const SCHEMA_V1 = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS local_spot (
  client_uuid TEXT PRIMARY KEY,
  server_id   INTEGER,
  lat         REAL    NOT NULL,
  lon         REAL    NOT NULL,
  name        TEXT,
  note        TEXT,
  rating      INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  tags        TEXT    NOT NULL DEFAULT '[]',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER,
  sync_state  TEXT    NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_spot_sync
  ON local_spot(sync_state)
  WHERE sync_state != 'synced';

CREATE INDEX IF NOT EXISTS idx_spot_geo
  ON local_spot(lat, lon)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS sync_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`;

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(SCHEMA_V1);
  const row = await db.getFirstAsync<{ version: number }>(
    "SELECT version FROM schema_version LIMIT 1",
  );
  if (!row) {
    await db.runAsync("INSERT INTO schema_version (version) VALUES (1)");
  }
}

/**
 * Opens (or returns memoised handle to) the encrypted SQLite database.
 *
 * Encryption is via SQLCipher's `PRAGMA key`. expo-sqlite ships
 * SQLCipher when built with `EXSQLITE_USE_SQLCIPHER=1` Gradle flag —
 * see app.json plugin config in Phase 1. Without that flag, this still
 * opens but is not encrypted; safe enough for v0 dev, MUST verify
 * before Phase 5 release.
 */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const key = await getOrCreateDbKey();
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(`PRAGMA key = '${key.replace(/'/g, "''")}'`);
      await migrate(db);
      return db;
    })();
  }
  return dbPromise;
}

export async function resetDbForTests(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise;
  await db.closeAsync();
  dbPromise = null;
}
