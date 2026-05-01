# Geobiom Mobile (apps/mobile)

Android-first React Native приложение по `docs/mobile-app-2026-05.md`.
Текущий статус — **Phase 0 spike**: ровно один экран с PMTiles-картой
выделов + GPS-маркером. Цель — доказать на физическом Android, что
стек (Expo bare + maplibre-react-native + локальный PMTiles +
expo-location) работает offline.

## Что нужно поставить на dev-машину

1. **Node 18+** уже стоит для веба, ОК.
2. **Java JDK 17** (Adoptium / Microsoft Build of OpenJDK).
3. **Android Studio** + Android SDK (API 34) + Android SDK Build-Tools 34.
   Через SDK Manager: `Android 14.0 (API 34)`, `Android SDK Build-Tools
   34.0.0`, `Android SDK Command-line Tools`, `Android Emulator`,
   `Android SDK Platform-Tools`.
4. **Android device** — физический телефон с включенным USB-debugging,
   либо AVD-эмулятор (Pixel 6 / API 34, x86_64).
5. **Environment variables**:
   - `JAVA_HOME` → JDK 17 install
   - `ANDROID_HOME` → `%LOCALAPPDATA%\Android\Sdk`
   - PATH += `%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\emulator`

Проверить: `adb devices` показывает устройство; `java -version` пишет
17.x.

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
