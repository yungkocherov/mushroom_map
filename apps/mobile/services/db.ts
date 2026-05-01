import * as SQLite from "expo-sqlite";

const DB_NAME = "geobiom.db";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

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
 * Opens (or returns memoised handle to) the SQLite database.
 *
 * **NOT encrypted in v0.** expo-sqlite ships без SQLCipher по умолчанию;
 * включение требует кастомного билда (EXSQLITE_USE_SQLCIPHER=1 +
 * react-native-quick-sqlite либо op-sqlite). Перед Phase 5 release
 * (RuStore / публичная раздача APK) — обязательно: либо переезд на
 * op-sqlite с SQLCipher, либо явное предупреждение юзеру что local DB
 * читается root-доступом на устройстве. Сейчас (Phase 0/1 dev) — OK,
 * данных нет.
 */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
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
