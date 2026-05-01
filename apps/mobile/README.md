# Geobiom Mobile (apps/mobile)

Android-first React Native приложение по `docs/mobile-app-2026-05.md`.
Текущий статус — **Phase 0 spike**: ровно один экран с PMTiles-картой
выделов + GPS-маркером. Цель — доказать на физическом Android, что
стек (Expo bare + maplibre-react-native + локальный PMTiles +
expo-location) работает offline.

## Что должно быть установлено

### Поставлено autonomous-run'ом 2026-05-01

- **Node 24** уже было для веба
- **JDK 17** — `Microsoft.OpenJDK.17` через winget,
  `JAVA_HOME=%LOCALAPPDATA%\Programs\Microsoft\jdk-17.0.10.7-hotspot`,
  на User PATH
- **Android SDK** через cmdline-tools (без полного Android Studio) в
  `%LOCALAPPDATA%\Android\Sdk\`. `ANDROID_HOME` + `ANDROID_SDK_ROOT` в
  User env. На User PATH добавлены `Sdk\platform-tools` и
  `Sdk\cmdline-tools\latest\bin`. Установлены пакеты: `platform-tools`
  (adb), `platforms;android-34`, `build-tools;34.0.0`.
- **pmtiles CLI** v1.22.2 в `%USERPROFILE%\bin\pmtiles.exe` (уже на PATH)
- **RN deps** через `npm install --workspaces`

### Чего НЕТ — поставить вручную если нужно

- **Android Emulator** — для AVD понадобится `emulator` package + system
  image. `sdkmanager "emulator" "system-images;android-34;google_apis;x86_64"`.
  Дев на физическом устройстве (USB-debug) — рекомендованный путь.
- **Полный Android Studio (IDE)** — не нужен для `expo run:android`.
  Если хочешь Logcat-UI / профайлер / AVD-manager — поставь руками
  с developer.android.com (1+ ГБ, требует click-through wizard).
- **Go** — winget MSI просит admin (1603). Если нужно `go install` для
  чего-то — установи руками: https://go.dev/dl/. Сейчас pmtiles взяли
  prebuilt-бинарник, Go не критичен.

### Открыть новый терминал после установки

Env vars выставлены в **User scope** через
`[Environment]::SetEnvironmentVariable(..., "User")`. Уже открытые
терминалы их не видят. Перезапусти PowerShell / VS Code — `adb`,
`java`, `pmtiles` появятся на PATH.

### Проверка

```bash
java -version          # → openjdk 17.0.10
adb version            # → Android Debug Bridge 35.0.x
pmtiles version        # → pmtiles 1.22.2
echo $ANDROID_HOME     # → C:\Users\<user>\AppData\Local\Android\Sdk
```

## Установка зависимостей

Из репо-root:

```bash
export PATH="/c/Program Files/nodejs:$PATH"
npm install --workspaces --include-workspace-root
```

Это поставит RN-deps в `apps/mobile/node_modules` (npm-workspace
hoists большую часть в `node_modules` корня, native pods/aar — в
workspace-локальном).

## Тестовые тайлы для spike

Spike читает `apps/mobile/assets/forest-luzhsky.pmtiles` — клипнутую
по bbox Лужского района копию forest.pmtiles. Файл в `.gitignore`
(большой). Сгенерировать локально:

```bash
# из репо-root, при docker compose up -d db
.venv/Scripts/python.exe -u scripts/clip_pmtiles_to_district.py \
  --district luzhsky \
  --in data/tiles/forest.pmtiles \
  --out apps/mobile/assets/forest-luzhsky.pmtiles
```

(Скрипт `scripts/clip_pmtiles_to_district.py` — будет добавлен в Phase 0
вместе с реальной интеграцией. Пока — обходной путь: взять
`data/tiles/forest.pmtiles` целиком, но осторожно — он 302 МБ, APK не
соберётся.)

## Запуск

```bash
# в первый раз: prebuild генерирует android/ из app.json
cd apps/mobile
npx expo prebuild --platform android --clean

# каждый запуск: установка debug-APK на устройство
npx expo run:android
```

Metro-сервер останется на 8081, Hot Reload работает.

## Что spike должен показывать

- Полноэкранная карта, центр на Луге.
- Выделы рисуются цветами по `dominant_species` (берёзовый —
  светло-зелёный, сосновый — тёмно-зелёный, и т.д.).
- Оверлей сверху: «GPS: ✓» + lat/lon ± accuracy.
- Синий MapLibre-маркер UserLocation + chanterelle dot из ShapeSource
  (избыточно, но проверяет оба способа отрисовки точки).
- В airplane mode карта продолжает отрисовываться (читается локальный
  `forest-luzhsky.pmtiles`), GPS работает (он независим от сети).

## Go/no-go gate Phase 0

Spike считается пройденным если:

- [ ] APK собирается без падений
- [ ] На физическом Android (Pixel 6+/Samsung mid-end) карта рисуется
  с **fps ≥ 30** при панорамировании
- [ ] PMTiles читаются из локального `assets/`-пути (не fallback'ится
  на network)
- [ ] GPS даёт fix < 30 секунд outdoor
- [ ] В airplane mode после обнуления симкарт — карта рисуется
- [ ] Battery drain за 30 минут активной работы < 8%

Если хоть один критерий валит — заводим issue в `docs/mobile-app-2026-05.md`
секции «Phase 0 progress» с детальной диагностикой и решаем: доделать
spike, или откатываться на PWA-стратегию.

## Что не работает в spike (намеренно)

- Нет авторизации (Phase 1)
- Нет сохранения спотов (Phase 3)
- Нет download-менеджера районов (Phase 2)
- Нет каталога видов / прогноза (Phase 4)
- Нет базовой карты (только paper-фон под выделами; Phase 2)
- Нет popup'а на тапе по выделу (Phase 2)

## Полезные команды

```bash
# Очистить Metro кэш
npx expo start --clear

# Логи устройства
adb logcat | grep -E "ReactNativeJS|MapLibre"

# Размер debug-APK
ls -lh android/app/build/outputs/apk/debug/app-debug.apk

# Запуск на конкретном устройстве из adb devices
npx expo run:android --device <serial>
```
