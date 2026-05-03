import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

/**
 * SQLCipher encryption key для local SQLite БД (geobiom.db).
 *
 * Хранится в Android Keystore (через expo-secure-store) под алиасом
 * `geobiom.dbKey`. Генерируется при первом запуске; при последующих
 * читается из Keystore и передаётся в op-sqlite open({encryptionKey}).
 *
 * Формат — 64-символьный hex (32 байта random) — passphrase для
 * SQLCipher PRAGMA key. SQLCipher делает PBKDF2-HMAC-SHA512 от
 * passphrase'а, мы передаём уже-random байты в hex'е.
 *
 * Если ключ потерян (factory reset устройства, очистка Keystore через
 * Settings → Apps → Geobiom → Storage → Clear data) — данные DB не
 * восстановить. Это by-design: secure-store всегда привязан к
 * device + app + (на новых Android) к user-pin'у.
 */
const KEY_ALIAS = "geobiom.dbKey";

let cached: string | null = null;

export async function getDbEncryptionKey(): Promise<string> {
  if (cached !== null) return cached;
  let key = await SecureStore.getItemAsync(KEY_ALIAS);
  if (!key) {
    const random = await Crypto.getRandomBytesAsync(32);
    key = Array.from(random)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    await SecureStore.setItemAsync(KEY_ALIAS, key, {
      // Секрет читается на main JS-thread'е сразу при открытии БД (cold
      // start). На всех Android-pin/lock-screen-сценариях это
      // допустимо — иначе мы бы блокировали открытие приложения до
      // ввода pin'а. Если в будущем потребуется stricter mode (e.g.
      // на запуск только после biometric prompt), снять
      // requireAuthentication=true.
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  }
  cached = key;
  return key;
}

/**
 * Только для тестов / инвалидации ключа в dev-сценарии.
 * В prod-flow вызывать осторожно — после `purgeDbEncryptionKey()`
 * + удаления geobiom.db файл нужно пересоздать заново.
 */
export async function purgeDbEncryptionKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_ALIAS);
  cached = null;
}
