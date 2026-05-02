# Release signing — Geobiom Android

Подпись release-APK / AAB для публикации в RuStore (или раздачи как
direct-APK). Делается **один раз** на dev-машине автора. После генерации
keystore нельзя терять — RuStore не принимает обновление приложения,
подписанное другим ключом.

## Шаги

### 1. Сгенерировать keystore

```bash
bash apps/mobile/scripts/generate-release-keystore.sh
```

Скрипт интерактивно спросит пароль и положит keystore в
`$HOME/.geobiom/release.keystore` (mode 600). Распечатает SHA-256
fingerprint — сохрани его, понадобится при первом аплоаде в RuStore.

### 2. Прописать пароль в global gradle.properties

Чтобы Gradle мог найти пароль при `./gradlew :app:assembleRelease`,
**но не в репо**, добавь в `$HOME/.gradle/gradle.properties`:

```
GEOBIOM_KS_PASSWORD=<тот же пароль что вводил в скрипт>
GEOBIOM_KS_ALIAS=geobiom-release
```

`$HOME/.gradle/gradle.properties` Gradle читает автоматически у каждого
проекта. Не путай с `android/gradle.properties` (который в репо).

Альтернатива — задать те же переменные через env vars в shell-инициализации:

```bash
# в .bashrc / .zshrc / Windows env
export GEOBIOM_KS_PASSWORD="..."
```

### 3. Бэкап keystore'а

**Обязательно**:

- Зашифрованный USB-stick / encrypted disk image. Положить вместе с
  `keystore.password.txt` (паспорт password-manager'а тоже работает).
- Распечатанный SHA-256 fingerprint в personal records (для верификации
  что keystore не подменили).

**НИКОГДА**:

- Не коммитить `release.keystore` в git (`.gitignore` уже игнорирует
  `*.keystore`, но проверяй `git status` руками).
- Не отправлять keystore по email / messenger без шифрования.
- Не выкладывать в публичные облака (Dropbox / Google Drive в открытом
  виде).

Потеря keystore = невозможность апдейтить приложение в RuStore. Появится
только опция «удалить старое приложение и опубликовать новое под другим
package name» — все юзеры будут терять историю.

### 4. Собрать release-AAB

```bash
cd apps/mobile
npx expo prebuild --platform android      # пересоздаст android/ если
                                          # нужно; config-plugin
                                          # `with-release-signing.js`
                                          # автоматически пропишет
                                          # release signingConfig
cd android
./gradlew :app:bundleRelease
```

Output: `apps/mobile/android/app/build/outputs/bundle/release/app-release.aab`.

Для APK (direct-distribution) — `./gradlew :app:assembleRelease`,
output `app/build/outputs/apk/release/app-release.apk`.

### 5. Проверить подпись

```bash
"$JAVA_HOME/bin/jarsigner" -verify -verbose -certs \
    apps/mobile/android/app/build/outputs/bundle/release/app-release.aab
```

Должно выдать `jar verified.` + сертификат с `CN=Geobiom`.

### 6. Аплоад в RuStore

См. `apps/mobile/docs/rustore-submission.md`.

## Что внутри config-plugin

`apps/mobile/plugins/with-release-signing.js` модифицирует
`android/app/build.gradle` после `expo prebuild`:

1. Добавляет `signingConfigs.release { ... }` блок, читающий
   `storeFile` из `~/.geobiom/release.keystore` и пароль из
   `GEOBIOM_KS_PASSWORD` (gradle.properties или env).
2. Переключает `buildTypes.release.signingConfig` с `signingConfigs.debug`
   (дефолт Expo) на `signingConfigs.release`.

Plugin переживает `prebuild --clean`, потому что подключён через
`app.json → plugins`. Без plugin'а — каждый prebuild сбрасывал бы release
build на debug.keystore.

## Когда нужно менять keystore (редко)

- Утечка пароля → новый keystore, `applicationId` меняется,
  публикация под другим именем (юзеры теряют апдейт-цепочку, но это
  единственный безопасный путь).
- Истечение validity (default 10000 дней ≈ 27 лет) — задолго до этого
  поговорить с актуальным RuStore process'ом.
