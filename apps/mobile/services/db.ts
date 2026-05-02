import * as FileSystem from "expo-file-system";
import { open, type DB as OpDB } from "@op-engineering/op-sqlite";
import { getDbEncryptionKey } from "./dbKey";

const DB_NAME = "geobiom.db";

/**
 * Совместимый API над op-sqlite — повторяет подмножество expo-sqlite,
 * которое реально используется в callsites (spotsRepo / regions /
 * sync / useOnboarding). Сохраняем сигнатуры чтобы миграция была
 * минимально-инвазивной — никаких правок в callsites.
 *
 * Все «*Async» методы здесь действительно async (returnирует Promise),
 * хотя op-sqlite execute синхронный — обёрнули в Promise.resolve()
 * чтобы не получать UnhandledPromiseRejection при исключениях из
 * native слоя (op-sqlite кидает синхронно). Производительности это
 * не убивает — JS-event-loop планирует эти .then() в текущем
 * микро-task'е.
 */
export type CompatDb = {
  execAsync: (sql: string) => Promise<void>;
  runAsync: (sql: string, params?: unknown[]) => Promise<void>;
  getFirstAsync: <T>(sql: string, params?: unknown[]) => Promise<T | null>;
  getAllAsync: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
  closeAsync: () => Promise<void>;
};

let dbPromise: Promise<CompatDb> | null = null;

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

function wrap(rawDb: OpDB): CompatDb {
  return {
    async execAsync(sql) {
      // Multi-statement через split по `;`. op-sqlite execute сам
      // multi-statement не поддерживает (как и у sqlite3 stepwise
      // execute) — режем и прогоняем по одному.
      const stmts = sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (const stmt of stmts) {
        await rawDb.execute(stmt);
      }
    },
    async runAsync(sql, params) {
      await rawDb.execute(sql, (params ?? []) as never);
    },
    async getFirstAsync<T>(sql: string, params?: unknown[]) {
      const r = await rawDb.execute(sql, (params ?? []) as never);
      return ((r.rows?.[0] as T | undefined) ?? null) as T | null;
    },
    async getAllAsync<T>(sql: string, params?: unknown[]) {
      const r = await rawDb.execute(sql, (params ?? []) as never);
      return (r.rows ?? []) as T[];
    },
    async closeAsync() {
      rawDb.close();
    },
  };
}

async function migrate(db: CompatDb): Promise<void> {
  await db.execAsync(SCHEMA_V1);
  const row = await db.getFirstAsync<{ version: number }>(
    "SELECT version FROM schema_version LIMIT 1",
  );
  if (!row) {
    await db.runAsync("INSERT INTO schema_version (version) VALUES (1)");
  }
}

/**
 * Если на диске остался plain-SQLite файл от предыдущей версии (Phase
 * 0..4 — expo-sqlite без шифрования), один раз скопируем данные в
 * новый encrypted-файл и удалим старый.
 *
 * Имя legacy-файла — `geobiom.db` в expo-sqlite location'е (внутри
 * SQLite/-папки в documentDirectory). op-sqlite кладёт свой
 * `geobiom.db` рядом, поэтому имена не коллидят.
 *
 * В dev-сценарии (где у юзера нет данных) функция no-op'ит после
 * первого запуска (legacy-файл удалён).
 */
async function migrateLegacyPlainDb(encryptionKey: string): Promise<void> {
  const docDir = FileSystem.documentDirectory;
  if (!docDir) return;
  const legacyPath = `${docDir}SQLite/${DB_NAME}`;

  let legacyInfo: FileSystem.FileInfo;
  try {
    legacyInfo = await FileSystem.getInfoAsync(legacyPath);
  } catch {
    return;
  }
  if (!legacyInfo.exists) return;

  // Open new encrypted DB и ATTACH legacy plain — copy table-by-table.
  // ATTACH 'KEY' = '' = unencrypted; KEY = '<key>' = encrypted source.
  let newDb: OpDB | null = null;
  try {
    newDb = open({ name: DB_NAME, encryptionKey });
    // Создаём схему чтобы INSERT'ы прошли
    await newDb.execute(SCHEMA_V1.split(";")[0]); // PRAGMA journal_mode
    for (const stmt of SCHEMA_V1.split(";").map((s) => s.trim()).filter(Boolean)) {
      await newDb.execute(stmt);
    }
    // ATTACH legacy as plain. Keep keys not interpolated into SQL —
    // ATTACH-stmt с '' as KEY означает no-encryption.
    await newDb.execute(`ATTACH DATABASE ? AS plain KEY ''`, [legacyPath]);
    // Скопировать таблицы (только те которые могут содержать данные).
    await newDb.execute(
      `INSERT OR IGNORE INTO local_spot SELECT * FROM plain.local_spot`,
    );
    await newDb.execute(
      `INSERT OR IGNORE INTO sync_meta SELECT * FROM plain.sync_meta`,
    );
    await newDb.execute(`DETACH DATABASE plain`);
    newDb.close();
    newDb = null;
    // Удалить legacy-файл + WAL/SHM спутники
    for (const suffix of ["", "-wal", "-shm", "-journal"]) {
      try {
        await FileSystem.deleteAsync(`${legacyPath}${suffix}`, {
          idempotent: true,
        });
      } catch {
        // best-effort
      }
    }
  } catch (err) {
    // Если миграция упала — оставляем legacy-файл, в encrypted DB
    // юзер увидит пустую базу. Это лучше чем потерять данные.
    // eslint-disable-next-line no-console
    console.warn("[db] legacy plain → encrypted migration failed:", err);
  } finally {
    if (newDb) {
      try {
        newDb.close();
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Opens (or returns memoised handle to) the encrypted SQLite database.
 *
 * SQLCipher включается через `op-sqlite.sqlcipher=true` в
 * apps/mobile/package.json (читается gradle-плагином op-sqlite на
 * билде). Encryption-key — 32-байтовый random, хранится в
 * expo-secure-store (Android Keystore). См. dbKey.ts.
 *
 * При первом запуске после апдейта со Phase 0-4 (где была plain
 * expo-sqlite) — `migrateLegacyPlainDb` копирует данные в новую
 * encrypted DB и удаляет старый файл. После одного успешного
 * cold-start легаси нет → миграция no-op.
 */
export function getDb(): Promise<CompatDb> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const encryptionKey = await getDbEncryptionKey();
      await migrateLegacyPlainDb(encryptionKey);
      const raw = open({ name: DB_NAME, encryptionKey });
      const db = wrap(raw);
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
