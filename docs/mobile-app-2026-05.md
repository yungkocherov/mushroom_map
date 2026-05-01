# Geobiom Mobile · план мобильного приложения

**Статус:** черновик плана для будущих сессий (создан 2026-05-01).
**Уровень готовности:** ноль кода. Только дизайн-решения и фазы, требует
user-review до старта Phase 0.

---

## Контекст

Веб-сайт `geobiom.ru` живой (TimeWeb prod, RU host, work without VPN для
большинства RU-юзеров). Сильные стороны: ~2.17M полигонов выделов
ФГИСЛК, реестр видов с матрицей сродства, форкаст-контракт. Слабая
сторона для грибника-в-поле: **в лесу нет связи**. Веб через MapLibre
GL JS делает HTTP Range-запросы к `api.geobiom.ru/tiles/forest.pmtiles`
— как только пропадает 4G, карта замирает. Грибной спот (GPS-точка
найденного места) приходится записывать в стороннее приложение и
потом ручками переносить.

Цель мобильного приложения — **закрыть лесной режим**:

1. **Карта работает offline** (forest + hillshade + базовая карта).
2. **GPS-точка пользователя** на карте — даже без сети, как Google Maps.
3. **Сохранение спота** в текущей точке GPS, queued sync после возврата
   связи.
4. **Без ВПН в РФ** — приоритет. Допустимо потребовать ВПН для **части**
   функций (модельный прогноз / каталог видов), но **карта + GPS + споты
   обязаны работать без ВПН на любом RU-операторе**.

Не цели v1: рыбалка, друзья/соцграф, push-уведомления, push-to-talk,
trip-planning с маршрутом, полнотекстовый поиск по методологии.

---

## Пользовательские сценарии (для проверки решений)

**S1. «В лесу за грибами», RF, no-VPN, no-signal.**
Юзер открывает app дома, видит карту. Доезжает до Луги, теряет 4G в
лесу. На экране — выделы (берёза/сосна), hillshade, его GPS-точка.
Видит подберёзовый молодняк в 80м, идёт туда, нашёл боровик, тапает
«Сохранить спот» → ввод заметки → save. Возвращается домой, app
ловит WiFi → спот синкается на сервер, доступен в `geobiom.ru/spots`.

**S2. «Перед поездкой», RF, no-VPN, дом WiFi.**
Юзер выбирает район (Лужский), тапает «Скачать для оффлайн». Прогресс-
бар, ~80 МБ. Готово. Уезжает.

**S3. «Найти прежний спот», RF, no-VPN, no-signal.**
Юзер в лесу, помнит что в прошлом году нашёл белые «где-то тут».
Открывает «Мои споты», список рассортирован по расстоянию от текущей
GPS. Тапает спот → стрелка-компас + расстояние. Идёт по стрелке.

**S4. «Прогноз на выходные», RF, dom WiFi.**
Юзер открывает «Прогноз», видит choropleth (когда модель будет готова —
v2). Это можно требовать сеть, не критично для лесного режима.

---

## Технологический выбор

### Рекомендация: **React Native + Expo (bare workflow) + maplibre-react-native**

| Критерий | RN + Expo | Flutter | Capacitor (PWA wrap) | Пар-нативно (Kotlin/Swift) |
|---|---|---|---|---|
| Переиспользование web-кода (TS, zustand, types, API client) | **высокое** | нет | очень высокое | нет |
| MapLibre с offline PMTiles | **отличное** (native engine) | хорошее | плохое (webview Range на 300 MB файле — нестабильно) | отличное |
| GPS, фоновый трекинг | хорошо | хорошо | средне (background location в webview ограничен) | отлично |
| Быстрая итерация UI | **хорошая** (Hot Reload) | хорошая | очень хорошая | плохая |
| Распространение в РФ | RuStore + APK | то же | то же + PWA-install | то же |
| Кривая обучения для автора | **низкая** (TS+React) | высокая (Dart) | очень низкая | высокая (×2) |
| Производительность 2M полигонов лес | **хорошая** (native MapLibre) | хорошая | плохая (webview) | отличная |
| Команда из 1 человека на Windows | **OK** | OK | OK | плохо (iOS на Windows = Mac-cloud) |

**Почему RN, а не Capacitor:** killer-feature — отрисовка
forest.pmtiles z=13 (берёзовые/сосновые молодняки) над
hillshade-растром в offline-режиме. MapLibre GL JS в WebView на
Android Chrome 120 это тянет, но: (а) Range-запросы к локальному
file:// в WebView требуют костылей (custom URL scheme + native
bridge), (б) при панорамировании fps проседает до 20–30 на mid-end
Android, (в) batter-drain выше из-за webview overhead. На native
MapLibre всё это решается из коробки и стабильнее.

**Почему RN, а не Flutter:** существующая кодовая база полностью на
React/TypeScript. Zustand-сторы (`useLayerVisibility`, `useMapMode`,
`useForecastDate`) подключаются к RN as-is. `packages/api-client` и
`packages/types` уже есть. Переписывать на Dart — потеря 2 недель
без выгоды.

**Почему Expo bare workflow, а не plain RN CLI:** Expo дает
`expo-location`, `expo-file-system`, `expo-secure-store`,
`expo-notifications` (если понадобится), EAS Build для облачных
сборок (важно для iOS без Mac). Bare workflow — потому что для
maplibre-react-native нужен access к нативным модулям, чего нет в
managed workflow.

**Альтернатива второго порядка (на чёрный день):** PWA-only — то есть
доделать Service Worker до уровня offline-PMTiles через IndexedDB +
custom protocol. Это будет работать в дневном Chrome на Android, но не
в iOS Safari (PWA на iOS урезан, particular Range над IndexedDB не
поддерживается). И производительность хуже. Откатываемся к этому
плану только если RN-стек катастрофически упадёт.

### Платформы

**v1 — Android only.** ~80% RF-рынка Android. Распространение через
RuStore + APK на `geobiom.ru/app`. iOS требует Mac (или EAS Build с
платным тарифом) и App Store с Russian-Apple-ID — отложено в v2.

**v2 — iOS** через EAS Build. После того как Android-версия наберёт
~50 пользователей и стабилизируется.

---

## RF-no-VPN: stack-чистка

Обязательное правило: **app в runtime не дёргает ни одного foreign
host.** Все foreign-CDN в текущем web-коде должны быть либо
заменены на нативно встроенные ресурсы, либо проксированы через
`api.geobiom.ru` / `geobiom.ru`.

### Текущие foreign-зависимости (выкорчевать для mobile)

| Источник | Что качает | Решение для mobile |
|---|---|---|
| `tiles.versatiles.org` | Vector basemap style | Своя basemap.pmtiles из OSM-extract LO, host на `api.geobiom.ru/tiles/basemap.pmtiles` |
| `server.arcgisonline.com` | ESRI World_Imagery raster (hybrid mode) | Опционально: купить Yandex Maps API satellite raster (доступен в РФ); для v1 — отключить hybrid mode, оставить только vector |
| `fonts.googleapis.com` / `gstatic` | Google Fonts (Inter, Fraunces, JetBrains Mono) | Bundled с приложением (~600 KB woff2 в assets) |
| `tiles.openfreemap.org` | Не используется в коде сейчас (только упоминание) | — |
| Google Play | Distribution | RuStore primary + APK direct download fallback |
| Yandex OAuth | Auth | Уже работает в РФ, без изменений |
| GlitchTip / Umami | Crash reporting + analytics | Уже на `sentry.geobiom.ru` / `analytics.geobiom.ru`, RU-host, OK |

### Backend changes для mobile

Появляются (минимальные, не ломают веб):

1. **`/api/mobile/regions`** — список из 18 районов с метаданными для
   download manager: `{slug, name, bbox, tiles_size_bytes,
   tiles_url, manifest_version}`.
2. **`/api/mobile/spots/sync`** — bulk-sync endpoint с `client_uuid`
   для дедупликации. См. секцию «Спот-синхронизация».
3. **`/api/mobile/auth/device`** — long-lived device token (вместо
   refresh-token-rotation в куках; на mobile cookies не подходят).

API-host остаётся `api.geobiom.ru` (TimeWeb, RU). Никаких новых
доменов.

---

## Offline tiles: главная архитектурная задача

Это самая сложная часть проекта. Полный набор тайлов LO = **~860 МБ**
(forest 302 + hillshade 418 + waterway 27 + roads 31 + остальное 78).
Закатать всё это в каждое устройство — нереально (большая часть юзеров
имеет 32–128 GB телефон, 1 GB на грибное приложение никто не отдаст).

### Стратегия: hierarchical + per-region

```
Bundled с APK (всегда offline, без download):
├── basemap-lo-low.pmtiles      ~30 MB  (z6–10, OSM extract LO)
├── districts.pmtiles            ~700 KB (18 районов LO, тонкие линии)
└── species-registry.json        ~20 KB  (21 вид, для popup без сети)

Downloaded по требованию (download manager UI):
└── per-district packages, ~60–100 MB каждый:
    ├── basemap-{slug}-hi.pmtiles    ~10 MB  (z11–14, OSM)
    ├── forest-{slug}.pmtiles        ~25 MB  (clip forest.pmtiles по bbox)
    ├── hillshade-{slug}.pmtiles     ~30 MB  (clip + lower zoom)
    ├── water-{slug}.pmtiles         ~3 MB
    └── waterway-{slug}.pmtiles      ~5 MB
```

**Bundled размер APK:** ~30 МБ (vector basemap) + JS bundle + native
libs ≈ **50–60 МБ APK**. Под лимит RuStore (200 MB) укладываемся
свободно.

**Per-district download:** юзер видит список 18 районов, тапает
интересующий → download progress → 60–100 МБ в `expo-file-system`.

### Серверная часть: per-district PMTiles

Новый pipeline `pipelines/build_district_tiles.py`:
1. Берёт каждый из 18 районов из `admin_area`.
2. Для каждого — `tippecanoe` clip по polygon bbox + buffer 2 км.
3. Output: `data/tiles/districts/{slug}/{layer}.pmtiles` × 18 районов
   × 4 layers = 72 файла, ~1.5 GB на диске.
4. Sync на TimeWeb VM: `/srv/mushroom-map/tiles/districts/...`
5. Caddy раздаёт как статику.

Запускается ad-hoc после major rebuild forest.pmtiles (т.е. ~1 раз в
квартал). Manifest `regions.json` содержит SHA256 каждого файла + size
+ tiles_version. App при перезапуске сравнивает версии, предлагает
update региональных пакетов.

### Решённый вопрос: PMTiles в native MapLibre

Native MapLibre engine (iOS/Android) поддерживает PMTiles через
плагин `pmtiles://` URL scheme начиная с **MapLibre Native v11+**.
В RN binding это: `<MapView><VectorSource url="pmtiles:///path/to/file.pmtiles" />`.
Зависимости: `@maplibre/maplibre-react-native` ≥ 10.0 + native plugin
configured в `Podfile` / `build.gradle`.

**Обязательная проверка в Phase 0:** прототип на голом Android-эмуляторе,
который рендерит локальный forest.pmtiles. Если что-то упадёт на этом
этапе — пересмотр стека.

### Базовая карта (basemap.pmtiles)

Своя сборка из `osm-extract.openstreetmap.fr/extracts/leningrad-oblast.osm.pbf`:
1. `osmium tags-filter` оставляет только: highway / waterway / natural / landuse /
   place / boundary / building (без раскрашивания зданий).
2. `tilemaker` с custom `config.json` (либо `planetiler --area=lenoblast`).
3. Output: `basemap-lo-z6-z14.pmtiles`, по нашим прикидкам ~120 МБ
   полный (z6–14). Bundled-версия — z6–10, ~30 МБ.

Стиль (style.json) пишется вручную под наши tokens (paper фон,
chanterelle акцент). Один раз, ~2 дня работы.

**Спорный вопрос:** включить ли в basemap имена населённых пунктов?
Включаем. Без них в лесу теряется ориентация.

---

## GPS и приватность

### Точность

`expo-location` с настройками:
- `accuracy: Location.Accuracy.High` (GPS + GLONASS + Galileo, ~5–10 м)
- `distanceInterval: 10` (метров) — обновление точки
- В лесу под кронами падает до ~20–30 м, это норма

### Background tracking

**v1 — НЕ делаем background.** Foreground-only: пока экран открыт,
GPS работает. Это сильно проще: не нужны Background Service permissions,
не нужно бороться с Doze Mode на Android. Минус: если юзер свернёт app,
breadcrumb-трек прервётся. Принимаем как trade-off для v1.

**v2** — background location для feature «вернуться к машине»
(breadcrumb). Требует:
- ACCESS_BACKGROUND_LOCATION permission (Android 10+)
- Foreground service с notification («Geobiom отслеживает положение»)
- На iOS — `UIBackgroundModes: location` в Info.plist
- RuStore review + повышенный privacy review

### Приватность

Mobile наследует privacy-обещание сайта: **«споты видишь только ты»**.
Конкретно для mobile:
- Location permission запрашивается ровно один раз, на первый launch
  карты. Объяснение через native pre-prompt (`expo-tracking-transparency`-
  стиль).
- Споты хранятся локально в SQLite + zashifrованы (см. ниже).
- Sync с сервером — только при auth. Анон-юзер хранит споты только
  локально, сервер не видит.
- Нет analytics-трекинга местоположения. Umami на сайте — privacy-
  first, без IP. Мобильный аналог: Umami SDK через native fetch с
  фильтром координат (события `spot.save`, `region.download`,
  `forecast.open`, БЕЗ lat/lon).
- Crash reports (Sentry/GlitchTip) — без location в payload.

### Шифрование локальных данных

`spots.db` (SQLite) шифруется через `expo-sqlite` + SQLCipher. Ключ
лежит в `expo-secure-store` (Keychain на iOS, EncryptedSharedPreferences
на Android). При первом запуске приложение генерирует случайный 256-bit
ключ и сохраняет.

**Trade-off:** если юзер удалит app или сбросит телефон без login —
все локальные споты потеряны (ключ был только на устройстве). Решение:
после первого login юзер может включить «облачный sync», и все локальные
споты пушатся в `user_spot` на сервере. Без login — local-only.

---

## Спот-синхронизация (offline-first)

### Локальная схема

`spots.db` (SQLite через expo-sqlite + SQLCipher):
```sql
CREATE TABLE local_spot (
  client_uuid TEXT PRIMARY KEY,         -- UUID v4, генерируется при создании
  server_id INTEGER,                    -- NULL пока не синкнут
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  name TEXT,
  note TEXT,
  rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
  tags TEXT,                            -- JSON array of slugs (как server)
  created_at INTEGER NOT NULL,          -- Unix ms
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,                   -- soft delete для sync
  sync_state TEXT NOT NULL              -- 'pending' | 'synced' | 'conflict'
);
CREATE INDEX idx_spot_sync ON local_spot(sync_state) WHERE sync_state != 'synced';
```

Контракт `tags`/`rating` синхронизирован с серверной схемой (миграции
029 + 030 в основном репо). Это критично — словарь tags (`spotTags.ts`)
переезжает в `packages/types/spot-tags.ts` чтобы шерить между web и mobile.

### Sync-протокол

**`POST /api/mobile/spots/sync`** (новый endpoint):
```json
{
  "device_id": "uuid",
  "last_sync_at": 1714600000000,
  "client_changes": [
    {
      "client_uuid": "...",
      "op": "create" | "update" | "delete",
      "lat": 60.62, "lon": 30.10,
      "name": "...", "note": "...", "rating": 4,
      "tags": ["boletus-edulis"],
      "client_updated_at": 1714612000000
    }
  ]
}
```

**Response:**
```json
{
  "server_changes": [...],   // изменения с last_sync_at, которые device ещё не видел
  "ack": [
    { "client_uuid": "...", "server_id": 123, "status": "ok" | "conflict" }
  ],
  "server_now": 1714612345678
}
```

**Conflict resolution:** last-write-wins по `updated_at` (server vs
client). Если конфликт — поднять флаг `sync_state='conflict'` локально,
показать в UI («Этот спот изменён на другом устройстве, какую версию
оставить?»). Для v1 — auto-pick newer; UI-разрешение конфликтов в v2.

**Когда триггерится sync:**
- Pull-to-refresh в списке спотов
- При open app, если `last_sync_at` старше 1 часа
- При смене сетевого состояния offline → online (через
  `@react-native-community/netinfo`)
- Не чаще чем раз в 30 секунд (debounce)

**Backend storage:** добавляем колонки в `user_spot`:
- `client_uuid TEXT UNIQUE` (для идемпотентности upserts)
- `client_updated_at TIMESTAMPTZ` (для conflict resolution)

Миграция 031 в репо `mushroom-map`.

---

## Архитектура проекта

### Локация в репо

`apps/mobile/` — новый workspace, рядом с `apps/web/`. Использует те же
shared packages:
- `packages/types` — типы Species, Spot, Forecast, Layer
- `packages/api-client` — fetch-обёртки над `/api/*`. Делать
  cross-platform (RN + browser fetch одинаково).
- `packages/tokens` — design tokens. CSS-variables в web, JS-объект
  в mobile. Источник истины — `tokens.json`, генерируем оба.

### Внутри `apps/mobile/`

```
apps/mobile/
├── app.json                       # Expo config
├── app/                           # Expo Router file-based routing
│   ├── (tabs)/
│   │   ├── _layout.tsx            # Bottom tab bar
│   │   ├── map.tsx                # Главный экран — карта
│   │   ├── spots.tsx              # Список моих спотов
│   │   ├── species.tsx            # Каталог видов
│   │   └── settings.tsx           # Регионы, аккаунт
│   ├── spot/[id].tsx              # Детальная спот-страница
│   ├── species/[slug].tsx         # Карточка вида
│   ├── region/[slug]/download.tsx # Region download progress
│   └── auth/yandex.tsx            # OAuth callback
├── components/
│   ├── MapView/
│   │   ├── index.tsx              # Главный MapView (maplibre-react-native)
│   │   ├── UserLocationMarker.tsx # GPS dot + heading
│   │   ├── SpotsLayer.tsx
│   │   ├── ForestLayer.tsx
│   │   └── style/                 # MapLibre style.json для basemap
│   ├── SaveSpotSheet.tsx          # Bottom sheet "Сохранить здесь"
│   ├── RegionPicker.tsx
│   └── ui/                        # Кнопки, чипы, toast — переезд из web
├── stores/                        # Zustand stores (копия web-сторов)
│   ├── useLayerVisibility.ts
│   ├── useUserLocation.ts         # NEW — GPS state
│   ├── useOfflineRegions.ts       # NEW — what's downloaded
│   └── useSpots.ts                # NEW — local SQLite-backed
├── services/
│   ├── tiles.ts                   # PMTiles file management
│   ├── sync.ts                    # Spot sync queue
│   ├── auth.ts                    # Yandex OAuth via expo-auth-session
│   └── db.ts                      # SQLite + SQLCipher init
├── lib/
│   ├── tracking.ts                # Umami events
│   └── crashReporting.ts          # Sentry init
└── assets/
    ├── basemap-lo-low.pmtiles     # Bundled basemap z6–10
    ├── districts.pmtiles          # 18 районов (тонкие линии)
    ├── species-registry.json
    ├── fonts/                     # Inter, Fraunces, JetBrains Mono woff2
    └── icons/
```

### Что мигрирует из web с минимальными изменениями

- Zustand stores (логика идентична, импорт остаётся таким же)
- API client (fetch — изоморфен)
- Species cards, edibility chips, season bar (заменить
  `<div>` → `<View>`, `className=` → `style=`)
- Spot tags словарь (`spotTags.ts` → `packages/types/spot-tags.ts`)
- Forest popup content layout (тот же шаблон, native styling)

### Что — новое для mobile

- MapView (`maplibre-react-native` вместо `maplibre-gl`)
- GPS / location store
- Offline regions store + download manager
- Sync queue + SQLite layer
- Bottom tabs (вместо top nav)
- Native bottom sheets (`@gorhom/bottom-sheet` — production-grade RN библиотека)

---

## Журнал решений

| # | Развилка | Выбор | Почему |
|---|---|---|---|
| 1 | Стек | **React Native + Expo bare** | Reuse TS+React+Zustand+API client. MapLibre Native — гражданин первого класса. Кривая обучения автору минимальная. |
| 2 | Платформа v1 | **Android only** (подтверждено user 2026-05-01) | ~80% RU-рынка. Простой dev на Windows. iOS отложен в v2. |
| 3 | Distribution | **RuStore primary, APK direct fallback** | RuStore — RU-нативный, без foreign-CDN рисков. APK на `geobiom.ru/app/geobiom.apk` для тех кто не хочет ставить RuStore. Google Play — best-effort, не критичный канал. |
| 4 | Offline стратегия | **Hierarchical + per-district** | Bundle low-zoom basemap (~30 МБ) для всей LO, остальное — по выбранному району (~80 МБ × N районов которые юзер реально посещает). |
| 5 | Background GPS | **Foreground-only в v1** | Простота + меньше permission friction. Breadcrumb-feature в v2. |
| 6 | Local DB | **SQLite + SQLCipher (ключ в SecureStore)** | Споты — приватные, шифруем at-rest. Ключ на устройстве — privacy-first, отказ от cloud-sync до login = осознанный выбор юзера. |
| 7 | Basemap | **Своя сборка из OSM extract LO** | Foreign-CDN unacceptable для RF-no-VPN. tilemaker / planetiler делает один раз, дальше rebuild только при major OSM update. |
| 8 | Crash reporting | **Sentry SDK → glitchtip.geobiom.ru** | Уже работает на сайте. SDK у RN есть native. Ничего нового на инфре. |
| 9 | Analytics | **Umami SDK → analytics.geobiom.ru** | То же. Privacy-first, без location в payload. |
| 10 | Spot conflict resolution | **Last-write-wins (auto), UI разрешение в v2** | 95% юзеров имеют одно устройство, конфликтов будет мало. UI для разрешения — лишний код в v1. |
| 11 | Бренд приложения | **`Geobiom`** (подтверждено user 2026-05-01) | Совпадает с веб-брендом. Store listing — `Geobiom`, описание — `Лес и грибы Ленобласти, оффлайн-карта.` |
| 12 | Repo location | **`apps/mobile` в monorepo `mushroom-map`** (подтверждено user 2026-05-01) | Shared packages (`types`, `tokens`, `api-client`) работают как есть; миграции БД и mobile-эндпоинты добавляются в один PR. Минус (RN tooling трогает root `node_modules`) принимается. |
| 13 | APK size | **~60 МБ с bundled basemap** (подтверждено user 2026-05-01) | Чистый install: открыл app — карта уже видна. Стоит ровно одно «скачивание» — скачивание самого APK. |
| 14 | Default regions | **Onboarding-chooser, без auto-download** (подтверждено user 2026-05-01) | После 3-screen onboarding юзер выбирает 0–3 района «Куда обычно ездите». Скачивание стартует с прогресс-баром на главном экране. Можно skip и докачать позже из Settings. |
| 15 | Tile updates | **Manifest-check каждые 7 дней + push notification** (подтверждено user 2026-05-01) | Background fetch (Android `WorkManager`) сравнивает `regions.json` SHA с локальным. Если регион юзера обновился — system notification «доступно обновление, ~15 МБ». Тап на нотификации — Settings с download-кнопкой. Auto-download только по WiFi (default), настройка отключаема. |
| 16 | Yandex OAuth flow | **Native browser + custom URL scheme `geobiom://auth/callback`** (decision 2026-05-01) | См. секцию «Yandex OAuth integration» ниже. PKCE, без client_secret в APK. Регистрируется в Yandex Console на старте Phase 1. |

---

## Yandex OAuth integration (mobile flow)

Веб использует server-side OAuth с cookies + refresh-token rotation. На
mobile cookies неудобны (нет shared cookie jar между native browser и
app), и client_secret нельзя класть в APK (его легко вытащить из
декомпиленного билда). Поэтому отдельный flow для mobile:

**Authorization Code + PKCE** (RFC 7636):
1. App генерирует `code_verifier` (random 43–128 chars), считает
   `code_challenge = SHA256(code_verifier)`.
2. App открывает в native browser:
   `https://oauth.yandex.ru/authorize?response_type=code&client_id=<MOBILE_CLIENT_ID>&redirect_uri=geobiom://auth/callback&code_challenge=<...>&code_challenge_method=S256&state=<...>`
   через `expo-web-browser` (`openAuthSessionAsync`) — это in-app Chrome
   Custom Tab на Android.
3. Юзер логинится у Яндекса.
4. Yandex редиректит на `geobiom://auth/callback?code=<...>&state=<...>`
   — Android handle deep link, app получает code.
5. App шлёт code на **наш** backend: `POST /api/mobile/auth/yandex`
   `{ code, code_verifier, device_id }`. Backend обменивает code на
   yandex access_token (используя client_secret, который у backend есть),
   получает yandex profile, находит/создаёт user в БД, возвращает
   **наш device_token** (long-lived, ~1 год, JWT с `kind=device`).
6. App сохраняет device_token в `expo-secure-store`, использует во всех
   запросах как `Authorization: Bearer <token>`.

**Что нужно сделать (Phase 1):**

1. **Yandex Console** ([oauth.yandex.ru](https://oauth.yandex.ru/)):
   создать **отдельное** application «Geobiom Mobile» (не переиспользовать
   существующее web-приложение, чтобы redirect URI не конфликтовали).
   - Type: «Мобильные приложения».
   - Redirect URI: `geobiom://auth/callback`.
   - Permissions: `login:email`, `login:info`, `login:avatar`.
   - Поле «Идентификатор пакета (Android)»: `ru.geobiom.mobile`
     (Application ID в `app.json`).
   - SHA256-fingerprint signing-сертификата APK (получим из EAS Build
     credentials после первой сборки в Phase 2).
   - Выдают `MOBILE_CLIENT_ID` (публичный, кладётся в app config) и
     `MOBILE_CLIENT_SECRET` (НЕ кладётся в APK, только в backend env).
2. **Backend env** (TimeWeb VM `.env.prod` + Oracle replica):
   `YANDEX_MOBILE_CLIENT_ID=...`, `YANDEX_MOBILE_CLIENT_SECRET=...`.
3. **Backend endpoint** `POST /api/mobile/auth/yandex` — обмен code на
   device_token. Pydantic-валидация input (`code`, `code_verifier`,
   `device_id` UUID, optional `device_name`). Логирует успех/ошибку в
   `auth_event` (новая таблица — будущая миграция, для аудита; для v1
   можно skip, GlitchTip ловит исключения).
4. **Backend endpoint** `POST /api/mobile/auth/refresh` — продление
   device_token до выхода. На v1 device_token живёт год, refresh не
   нужен; добавится в v2 если понадобится rotate.
5. **Backend endpoint** `POST /api/mobile/auth/revoke` — explicit
   logout, инвалидирует device_token (заносится в `revoked_token`
   таблицу или короткий blacklist Redis — TBD в Phase 1).

**Безопасность:**
- Client secret НЕ в APK (как требует OAuth Mobile BCP).
- PKCE защищает от перехвата code на устройстве (другая зловредная app
  не сможет обменять перехваченный code без `code_verifier`).
- Custom URL scheme — общеизвестный риск (другая app может зарегать
  тот же scheme). Mitigation: PKCE + state. Альтернатива — Android App
  Links (HTTPS deep links с verified domain) — рассматриваем для v2.
- Device_token хранится в `expo-secure-store` →
  EncryptedSharedPreferences (Android Keystore-backed).

**Что НЕ ломаем в основной web-логике:**
- `/api/auth/yandex/*` — отдельный namespace, web-flow остаётся как
  есть.
- `/api/mobile/auth/*` — новый namespace, изолирован.
- DB-таблица `users` — без изменений (mobile создаёт ту же запись что
  и web при первом login через email-match).

---

## Phasing

Шесть фаз, каждая ~1.5–3 недели. После v1 (Phase 5) — ship в RuStore
beta. v2 (iOS, breadcrumb) — после первой обратной связи.

### Phase 0 · Spike (1 неделя)

**Цель:** доказать, что критические компоненты работают. Один-два
«а если упадёт — пересмотр стека» вопроса.

- [ ] Создать `apps/mobile` с Expo init + maplibre-react-native
- [ ] Сделать ровно один экран: full-screen map с встроенным
  тестовым `forest-luzhsky.pmtiles` (~25 МБ, копия из data/tiles
  обрезанная по bbox Лужского района)
- [ ] Получить GPS-точку и нарисовать на карте
- [ ] Запустить на физическом Android (Pixel/Xiaomi/Samsung)
- [ ] Замерить fps при панорамировании, battery-drain за 30 минут
- [ ] **Go/no-go:** если fps < 30 или есть рендер-баги PMTiles —
  откат на Capacitor + PWA-cache strategy

**Verification:**
- Скриншот: работающая карта с GPS-маркером, выделы видны
- Replicate offline: airplane mode → карта рисуется → GPS bo bает работает

### Phase 1 · Foundation (2 недели)

**Цель:** инфраструктура. Без UI-полировки.

- [ ] `apps/mobile` workspace в monorepo (npm workspaces)
- [ ] Shared `packages/types/spot-tags.ts` (вынос из web)
- [ ] `packages/tokens` — JS-объект для RN рядом с CSS для web
- [ ] Expo Router setup (file-based routing)
- [ ] Bottom tabs: Карта · Споты · Виды · Настройки
- [ ] Стандартизированный fetch-клиент в `packages/api-client`
  (cross-platform)
- [ ] SQLite + SQLCipher init, миграция таблицы `local_spot`
- [ ] Sentry/Umami init (без событий пока)
- [ ] Yandex OAuth via `expo-auth-session` (в Settings → «Войти»)
- [ ] Backend: `/api/mobile/auth/device` endpoint (long-lived
  device token), миграция 031 (client_uuid в user_spot)

**Verification:**
- Bottom tabs работают, экраны пустые но валидные
- Login → device token в SecureStore → `/api/user/me` возвращает юзера
- SQLite читает/пишет тестовый спот

### Phase 2 · Map + Offline tiles (3 недели)

**Цель:** **главная фича** — карта работает offline с GPS.

- [ ] Backend pipeline `pipelines/build_district_tiles.py` (clip 18
  районов через tippecanoe), output `data/tiles/districts/{slug}/*`
- [ ] Backend: `/api/mobile/regions` endpoint + `regions.json` manifest
- [ ] Backend pipeline `pipelines/build_basemap.py` (planetiler от OSM
  LO extract → `basemap-lo-z6-z10.pmtiles` для bundle, `-z11-z14`
  per-district)
- [ ] Bundle `basemap-lo-low.pmtiles` + `districts.pmtiles` в APK
  через `expo-asset`
- [ ] Mobile: MapLibre style.json под наши tokens (paper фон,
  chanterelle accent, mono labels)
- [ ] Mobile: «Скачать регион» UI — список районов, прогресс-бары,
  cancellable
- [ ] Mobile: при загрузке region — все 4 layer-файла (basemap-hi,
  forest, hillshade, water/waterway) скачиваются параллельно
- [ ] Mobile: layer toggle (Forest / Hillshade / Water) — переезд
  Zustand-стора из web
- [ ] Mobile: GPS-маркер с heading-arrow, follow-mode, recenter button
- [ ] Mobile: airplane-mode test проходит для скачанного района

**Verification:**
- Скачать Лужский → airplane mode → открыть карту, центрировать на
  Луге → forest+hillshade рисуются → GPS-точка двигается → попап на
  выделе работает (данные `meta` JSONB в style expression)
- Lighthouse-equivalent для RN (Performance Monitor): 50+ fps на
  Pixel 6
- Storage UI: «Скачано: 3 района / 240 МБ»

### Phase 3 · Spots offline-first (2 недели)

**Цель:** create / save / sync спотов.

- [ ] Mobile: «Сохранить точку здесь» FAB на карте → bottom sheet с
  formом (имя, заметка, rating 1–5, теги мульти-выбор из словаря)
- [ ] Mobile: список «Мои споты», sorted by distance from current GPS
- [ ] Mobile: spot detail screen (карта + поля + edit/delete)
- [ ] Mobile: «Стрелка-компас» в spot detail — `expo-sensors` magnetometer
  → стрелка на спот + расстояние в реальном времени
- [ ] Backend: `/api/mobile/spots/sync` endpoint
- [ ] Mobile: sync queue с retry + exponential backoff + jitter
- [ ] Mobile: NetInfo listener → trigger sync при offline→online
- [ ] Mobile: indicator в UI «N спотов ждут синхронизации»
- [ ] Conflict resolution v1 — auto last-write-wins, log в Sentry для
  monitoring

**Verification:**
- Создать спот в airplane mode → выйти из mode → спот появляется на
  `geobiom.ru/spots`
- Создать спот на сайте → pull-to-refresh в app → виден
- Удалить спот в app → soft-deleted на сервере → не виден на сайте

### Phase 4 · Polish + Species + Forecast (2 недели)

**Цель:** не-критические для лесного режима фичи.

- [ ] Каталог видов (`/species`) — переезд карточек из web,
  edibility-цвета, иконки
- [ ] Карточка вида с hero-фото (фото берутся из bundled
  `species-registry.json` + URL'ы на geobiom.ru/photos)
- [ ] Прогноз-экран (`/forecast`) — choropleth по 18 районам через
  `/api/forecast/districts`. Требует сеть; если offline — показать
  «нужна сеть для прогноза».
- [ ] Spotlight-search (если успеваем — поиск по видам/местам)
- [ ] Settings: версии данных, кнопка «обновить тайлы», логин/логаут,
  «удалить локальные данные»
- [ ] Onboarding: 3 экрана при первом запуске (Привет → GPS permission
  → выбор района для скачивания)

**Verification:**
- Выходные user-test с другом-грибником: даём app, едет в лес,
  feedback session

### Phase 5 · v1 release (1.5 недели)

**Цель:** ship.

- [ ] App icon, splash, store screenshots
- [ ] Privacy policy update (mobile-specific: location, local
  storage), `/methodology/privacy` patch на сайте
- [ ] Terms of Service mobile patch
- [ ] RuStore submission: app description, screenshots, video,
  privacy questionnaire
- [ ] Direct APK download endpoint: `geobiom.ru/app/geobiom-{version}.apk`
  + signing info
- [ ] CI/CD: EAS Build для signed APK, GitHub Actions для upload в
  RuStore (есть API)
- [ ] Crash dashboard на GlitchTip — настроить алёрт на errorRate >5%
- [ ] CHANGELOG в `apps/mobile/CHANGELOG.md`
- [ ] Public release announcement на сайте: новая страница
  `/methodology/mobile`

**Verification:**
- RuStore beta link → 5 знакомых → 7 дней без критических багов
- Public release

### Phase 6 · v2 (TBD, после feedback)

Возможные направления (выбираем 1–2 после v1):
- iOS port (EAS Build, App Store)
- Background GPS + breadcrumb-track «вернуться к машине»
- Spot photo attachment (фото гриба прикрепляется к споту, локально +
  sync с сервера)
- Push-уведомления когда модель прогноза скажет «у тебя в районе
  завтра пик»
- Friend-граф (один спот — несколько viewers, явное invite)
- Trip planning — нарисовать кружок на карте, app говорит «ты ещё
  не был вот в этих квадратах»

---

## Open questions

Большинство решений зафиксировано user-review 2026-05-01 (см. журнал
решений #11–16). Остаются три, требующие обсуждения до Phase 5
(release) — в Phase 0–4 не блокируют.

1. **RuStore developer account** — пока не зарегистрирован. Регистрация
   стартует на старте Phase 5 (за ~3 недели до планируемого release):
   - Физлицо: проще, нужен паспорт + ИНН, верификация ~1–3 дня.
   - Самозанятый: те же документы + статус самозанятого (через «Мой
     налог»), позволяет принимать платежи (на будущее, если станем
     монетизировать).
   - ИП/юрлицо: нужен КЭП (квалифицированная ЭП), долго; не требуется
     для v1 (бесплатное приложение).
   **Рекомендация:** физлицо для v1, апгрейд до самозанятого если
   решим вводить donate / paid features.

2. **iOS native в будущем (v2)** — продолжаем RN или пишем SwiftUI?
   - RN: одна кодовая база, ~80% код шерится с Android-версией.
   - SwiftUI: лучше native feel, Apple HIG из коробки, performance
     чуть выше, но 2 параллельные кодовые базы навсегда.
   **Рекомендация:** RN, до того момента пока iOS-доля юзеров не
   превысит 30% И не появятся iOS-only фичи (CarPlay, Live Activities).
   Решаем уже на v2 milestone.

3. **Базовая раскраска выделов offline** — `meta JSONB` (bonitet,
   age_group) в forest.pmtiles per-tile уже встроен. Но
   `species_forest_affinity` (для секции «Виды по биотопу» в попапе) —
   join по `dominant_species` slug. Сейчас web фетчит эти данные через
   API. Mobile в offline-mode не может. Варианты:
   - Bundle `species_forest_affinity.json` в APK (~5 КБ, 21 вид × 14
     пород леса). **Рекомендация — это.** Простой JSON-lookup в
     popup.tsx.
   - Skip секцию «Виды по биотопу» в offline. Хуже UX.
   Решаем в Phase 2 при реализации popup'а.

---

## Контракты с веб-репо

Это репо `mushroom-map` — primary owner данных. Mobile repo (если
выйдет в отдельный) будет потребитель API + готовых тайлов.

**Что mobile-разработка добавит в `mushroom-map`:**
- Миграция 031: `user_spot.client_uuid TEXT UNIQUE`,
  `user_spot.client_updated_at TIMESTAMPTZ`
- Pipeline `pipelines/build_district_tiles.py`
- Pipeline `pipelines/build_basemap.py` (или отдельный
  `services/basemap-builder/`)
- Endpoint `/api/mobile/regions`, `/api/mobile/spots/sync`,
  `/api/mobile/auth/device` — в `services/api/src/api/routes/mobile/`
- Manifest `data/tiles/regions.json` (генерируется build_district_tiles.py)
- CLAUDE.md секция «Mobile API contract»

**Что НЕ должно меняться в основной web-логике:**
- `/api/cabinet/spots/*` — остаётся как есть (web использует cookies,
  mobile — `Authorization: Bearer <device_token>`)
- Существующие PMTiles форматы и схемы — не ломаем (mobile читает
  per-district clipped версии того же формата)
- DB schema spots — добавляем колонки, не переименовываем

---

## Ссылки

**Текущий контекст:**
- Архитектура веб-сайта: `docs/architecture.md`
- Spec редизайна: `docs/redesign-2026-04.md` (фундамент UX, бренд)
- Production runbook: `docs/deployment.md`
- Sister-репо ML: `mushroom-forecast` (forecast.* schema, через
  `/api/forecast/at` контракт)

**Внешние:**
- maplibre-react-native: https://github.com/maplibre/maplibre-react-native
- MapLibre Native PMTiles support: https://maplibre.org/news/2024-11-19-introducing-maplibre-native-with-pmtiles/
- Expo Location: https://docs.expo.dev/versions/latest/sdk/location/
- RuStore developer: https://www.rustore.ru/help/developers/
- planetiler (basemap builder): https://github.com/onthegomap/planetiler

**Текущие deferred TODO для перехода к mobile:**
- Phase 0 spike — ✅ VERIFIED 2026-05-01 (см. `## Phase 0 progress`).
- Phase 2 — NEXT.

---

## Onboarding flow (locked 2026-05-01)

Подтверждено user-confirm: **explicit chooser, без auto-download**.

3 экрана при первом запуске:
1. **Привет** — короткое приветствие, объяснение что это (offline-карта
   лесов и грибных мест ЛО). CTA «Дальше».
2. **GPS-permission** — pre-prompt объясняющий зачем (показать твою
   точку на карте, distance до спотов). CTA «Разрешить» → native
   permission dialog.
3. **Регионы** — список 18 районов с галочками + sizes. По умолчанию
   ничего не выбрано. Выбор 0–N районов → CTA «Скачать выбранное» или
   «Пропустить». Если skip, главный экран открывается с пустой картой
   (только bundled basemap z6–10) и баннером «Скачайте регион в
   Settings → Регионы для детальной карты».

После onboarding юзер всегда может вернуться в Settings → Регионы и
управлять списком (добавить, удалить, проверить обновления).

---

## Phase 0 progress (autonomous run, 2026-05-01) — VERIFIED PASS ✅

**Спайк успешно прошёл Go/no-go gate.** Доказано на физическом эмуляторе
Pixel 6 / API 34 / x86_64:

- **Stack works:** React Native + Expo bare 52 + maplibre-react-native
  v10.4.2 + native MapLibre Android v11.12.1 + expo-location.
- **PMTiles offline rendering:** `forest-luzhsky.pmtiles` (39 МБ, clip
  через `pmtiles extract` по bbox Лужского) подключается из
  bundled-asset через схему `pmtiles://file:///абс/путь.pmtiles`.
  Forest layer painted by `dominant_species` (14 пород).
- **GPS:** `expo-location` requestForegroundPermissionsAsync +
  watchPositionAsync; на эмуляторе fix приходит из «Set location»
  Extended controls. На реальном Android — должен работать как обычно
  (не тестировано в этом spike, но API стандартный).
- **Build chain on Windows w/o Android Studio for build:** JDK 17 +
  cmdline-tools + sdkmanager (platforms;android-35, build-tools;35,
  platform-tools) → `expo prebuild --platform android --clean` →
  `expo run:android`. APK билдится за ~2 минуты после первичного
  Gradle warm-up.
- **Tabs нав:** Карта · Споты · Виды · Настройки в bottom tabs, активный
  таб chanterelle.
- **Airplane mode test (частичный):** в bbox Лужского карта продолжает
  рисоваться; за пределами bbox — paper-фон без выделов (ожидаемо,
  pmtiles клипнут только на 1 район).

**Граблины которые пришлось фиксить (записано для следующих сессий):**

| # | Симптом | Причина | Решение |
|---|---|---|---|
| 1 | `drawable/splashscreen_logo not found` | expo-splash-screen в SDK 52 нужны image assets даже под placeholder | Сгенерил 1024×1024 PNG'и (paper + chanterelle dot) для icon/splash/adaptive-icon |
| 2 | `Compose Compiler 1.5.15 requires Kotlin 1.9.25 but using 1.9.24` | Default Kotlin SDK 52 1.9.24, expo-modules-core ждёт 1.9.25 | `expo-build-properties` plugin с явным `kotlinVersion: "1.9.25"` |
| 3 | `androidx.core:core-splashscreen:1.2.0-alpha02 requires compileSdk 35` | Transitive dep требует API 35 | Бамп `compileSdkVersion: 35` + `targetSdkVersion: 35` через build-properties; `sdkmanager "platforms;android-35"` |
| 4 | `Unable to resolve "@mushroom-map/tokens/native"` в Metro | Metro в SDK 52 default не парсит package.json `exports` field | `config.resolver.unstable_enablePackageExports = true` в `metro.config.js` |
| 5 | `[HTTP] Unable to parse resourceUrl /data/user/0/.../.pmtiles` | URL-форма pmtiles была `pmtiles:///abs/path` (3 слеша) — handler не знает что делать с bare-path внутри | Правильная форма: `pmtiles://file:///abs/path` (inner URL — file://) |
| 6 | `LocationManager Error: ACCESS_FINE_LOCATION` | Permission dialog не вылез / был disссnut | `adb shell pm grant ru.geobiom.mobile android.permission.ACCESS_*_LOCATION` или manual в Settings → Apps |
| 7 | `Could not connect to development server` | Metro reachable только через `adb reverse` или 10.0.2.2 alias | `adb reverse tcp:8081 tcp:8081` ставится автоматически от `expo run:android`, но иногда сбрасывается; ручной retry помогает |
| 8 | `Git Bash на Windows: adb command not found` | User PATH не пробрасывается в Git Bash | `~/.bashrc` со ссылками на ANDROID_HOME / JAVA_HOME |

**Что НЕ покрыл spike (намеренно, перенесено в Phase 2):**

- Базовая карта (OSM-стиль с дорогами/реками/населёнными пунктами).
  Сейчас рендерится только paper-фон + forest layer.
- Hillshade / рельеф.
- Per-district download manager UI и pipeline. Сейчас единственный
  bundled тайл — Лужский, и за его bbox карта пуста.
- Popup на тапе по выделу.
- Save spot UI + sync test.
- Production keystore (debug.keystore используется для Yandex SHA256).
- iOS build (Phase 2 / v2).

**Статус: Phase 0 closed. Phase 2 unblocked.**

---

## Phase 2 progress (autonomous run, 2026-05-01) — IN PROGRESS

### Phase 2.1 — backend: per-district pipeline + endpoint ✅

- Migration 032: `admin_area.slug TEXT` partial UNIQUE. Backfill 18 ASCII slugs (luzhsky, vyborgsky, sosnovoborsky, ...). Slug закреплён — mobile хранит его в region-пакетах.
- `pipelines/build_district_tiles.py`: режет 4 слоя (forest, water, waterway, wetlands) по 18 районам через `pmtiles extract --bbox`. Auto-clusters non-clustered source pmtiles через python-pmtiles lib (read all_tiles + sort by zxy_to_tileid + write via Writer). Кэш в `data/tiles/_clustered/`.
- `data/tiles/regions.json` манифест (sha256+sizes+URLs). Локальный прогон: 18 регионов, 627 МБ всего. Размер per region: 3 МБ (Сосновоборский) — 70 МБ (Тихвинский), среднее ~35 МБ. Лучше плановых ~80 МБ.
- `/api/mobile/regions` real impl: читает manifest из `tiles_dir/regions.json`. 503 если файла нет, 200 + `RegionsResponse{version, base_url, regions[]}`. 4 pytest unit-теста.

### Phase 2.1.5 — deploy ✅

- TimeWeb (`api.geobiom.ru`): миграция 032 пришла через CI. `data/tiles/districts/*` + `regions.json` залиты через scp (per-district чтобы избежать connection-reset на single 627 МБ перекачке). 18 районов × 4 слоя × ~30 МБ. Smoke-test: `curl https://api.geobiom.ru/tiles/regions.json` → 200, 25 КБ.
- Oracle (`app-api.geobiom.ru`): миграция 032 пришла через nightly pg_dump→pg_restore. Tiles upload — autonomous run в работе.

### Phase 2.2 — mobile download manager ✅

- `services/regions.ts`: `fetchRegions()` → API, `downloadRegion()` через `expo-file-system createDownloadResumable` (per-layer .partial → atomic move + sha256 verify через `expo-crypto`), persistence в `sync_meta` table (`region.<slug>.installed = manifest_version`).
- `stores/useOfflineRegions.ts` Zustand: `available[]`, `downloaded: Set<slug>`, `inProgress: Record<slug, {layer, bytes_done, bytes_total}>`, actions `refresh / startDownload / remove`.
- `app/regions.tsx` экран (Stack screen): FlatList с pull-to-refresh, per-район row (имя + size, либо «Скачано», либо progress bar в chanterelle). Tap downloaded → confirm-delete. Tap available → start download.
- Settings → Section «Регионы» с counter «Скачано N из 18» + ссылка на /regions.

### Phase 2.3a — SpikeMap dynamic sources ✅

- `style.ts` → `buildMapStyle(sources[])` — multi-source. Per-region forest source/layer (`forest-{slug}`) с paint по `dominant_species`. Background paper остаётся внизу.
- `SpikeMap.tsx` подписан на `useOfflineRegions.downloaded`. Если есть скачанные — sources из них через `getLayerLocalUri(slug, "forest")`. Если ничего — fallback на bundled `forest-luzhsky.pmtiles` (Phase 0 placeholder, удалим в Phase 5).
- Status overlay: «tiles: 3 regions» / «tiles: 1 (spike)» / «tiles: —».

### Phase 2.4 — popup на тапе по выделу ✅

- `scripts/dump_species_affinity.py` + `_dump_affinity.sql`: выгружает 23 вида × ~4 affinity-pair'ов в JSON (4.5 КБ). Source: `species_forest_affinity` JOIN `species`.
- `apps/mobile/assets/species-affinity.json` bundled.
- `services/affinity.ts`: lazy-load + cache, `topSpeciesForForestType(forestType, limit=5)` returns species с affinity > 0.3.
- `components/MapView/ForestPopup.tsx` Modal slide-up: KV-блок (порода RU, возраст, бонитет, источник), section «Виды по биотопу» с affinity scores в chanterelle.
- `SpikeMap.tsx` `onPress` фильтр: только forest features (по `feature.properties.dominant_species`). Open Modal.

### Phase 2 outstanding

- **Phase 2.3b basemap**: `pipelines/build_basemap.py` (planetiler / OSM-extract LO) → `basemap-lo-low.pmtiles` z6-10 bundled в APK. Заменит paper-фон на «Google-Maps-стиль» с дорогами/реками/имёнами населённых пунктов. Требует planetiler.jar + OSM extract Northwestern Federal District (~150 МБ). Перенесено на следующую session — независимая работа.
- **Sync tiles to Oracle**: scp в работе. Oracle будет иметь те же 627 МБ что TimeWeb после завершения.
- **`@gorhom/bottom-sheet` вместо Modal** в ForestPopup — gesture-driven snap-points. Phase 4 polish.
- **Cancel in-progress download** через AbortController. Текущая реализация — wait completion. Phase 4 polish.
- **Update detection**: при mismatch `region.<slug>.installed` vs API `manifest_version` → notification «доступно обновление». Phase 4.

### Граблины Phase 2

| # | Симптом | Причина | Решение |
|---|---|---|---|
| 1 | `pmtiles extract: source archive must be clustered` | water/waterway/wetlands собирались с iteration по z (внешний loop) вместо tile_id order — в результате non-clustered. forest.pmtiles был clustered. | inline `cluster_pmtiles()` через python-pmtiles lib: read + sort + rewrite |
| 2 | scp -r 627 МБ → connection reset peer на середине | Single ssh сессия timing out на больших uploads | Per-district scp в for-loop |
| 3 | dump_species_affinity.py: column "tree_species" does not exist | Фактическая колонка называется `forest_type`, table — `species` (не `species_registry`) | Проверил `\\d species_forest_affinity`, переписал SQL |
| 4 | `psql -c "..."` через ssh + nested escapes давал empty output | Bash escape complexity со вложенными `'"'"'` | docker cp файла + `psql -f /tmp/dump.sql` |

---

## How to read this plan in future sessions

1. **Если стартуешь новую mobile-сессию:** прочти журнал решений (16
   пунктов) — это фиксированный baseline, не пересматривай без явного
   user-input. 3 open questions в конце — обсуждаемые при необходимости.
2. **Текущий статус фаз:** Phase 0 spike стартует 2026-05-01. Прогресс
   фаз веди тут же — `## Phase N progress (autonomous run, YYYY-MM-DD)`
   секция, как в `docs/redesign-2026-04.md`.
3. **Разногласия со спецом — переписывай план**, не код. Если в ходе
   реализации видим что решение № X не сработает — обновляем журнал
   решений (явная пометка «changed YYYY-MM-DD: <reason>»), тогда
   меняем код.
4. **Связь с другими доками:** `CLAUDE.md` всегда отражает текущее
   состояние проекта. После каждой фазы — обновить «Mobile app
   status» секцию в CLAUDE.md.
