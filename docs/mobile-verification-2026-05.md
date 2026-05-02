# Mobile verification — Phase 2 + Phase 3 (2026-05-01)

Step-by-step guide для проверки всего что наработано в autonomous-run.
Для тебя — подтянуть код, пересобрать APK, прокликать сценарии,
сообщить что работает / что нет.

---

## 0. Предусловия

- Эмулятор `geobiom-test` (Pixel 6 / API 34) либо физический Android-телефон
  с USB-debug. Пользовательский путь — те же что в Phase 0 verification.
- Терминал Git Bash с env vars (`JAVA_HOME`, `ANDROID_HOME` etc.).
  Если не настроен — копируй блок из `apps/mobile/README.md`.

## 1. Подтянуть код + пересобрать APK

```bash
cd /c/Users/ikoch/mushroom-map

# Свежий код из main
git pull origin main

# Новые npm зависимости (expo-sensors, expo-build-properties, ...)
export PATH="/c/Program Files/nodejs:$PATH"
npm install --workspaces --include-workspace-root --no-audit --no-fund

# Готовим эмулятор + Metro reverse-port
adb devices                          # → emulator-5554 device
adb reverse tcp:8081 tcp:8081

# Удалить старый prebuild и собрать заново
cd apps/mobile
rm -rf android
npx expo prebuild --platform android --clean
npx expo run:android
```

`expo run:android` соберёт APK + установит + запустит. Первый раз
~5-7 минут (Gradle качает зависимости maplibre/sensors). Если упадёт
на Gradle — пришли последние ~50 строк.

## 2. Сценарии для проверки

После того как карта откроется на эмуляторе — пройди **по порядку**.

### 2.1 Главная карта — basemap + GPS

Должен видеть:
- ✓ **Basemap** под выделами: серые/коричневые тонкие линии дорог,
  голубые линии рек/ручьёв, имена населённых пунктов (Луга, Тосно,
  Гатчина, ...)
- ✓ **Полигоны выделов** леса — поверх basemap, разноцветные по
  породам (берёзовый светлый, еловый тёмный)
- ✓ **GPS** в верхней плашке: «GPS: ✓ + координаты + точность»
- ✓ **Tiles**: «1 (spike)» если ничего не скачано (fallback на bundled
  Лужский placeholder)

Симулируй GPS на эмуляторе (если ещё не):
- Three-dots `⋮` рядом с эмулятором → **Location** → введи `58.74` /
  `29.85` (центр Лужского) → **Send**

Должен увидеть chanterelle GPS-маркер в центре Лужского, выделы
вокруг.

### 2.2 Сохранить спот

Должна быть **оранжевая круглая FAB-кнопка** «+» в правом нижнем углу
(чуть выше tab-bar).

1. Тапни **+**
2. Откроется bottom-sheet «Сохранить спот»:
   - Координаты текущего GPS
   - Поле имени, заметки
   - Rating chips 1–5 (default 4 — chanterelle)
   - Tags: Белый, Подберёзовик, Подосиновик, и т.д.
3. Заполни (например, имя = «Тестовая поляна», rating = 4, tag = Белый)
4. Нажми «Сохранить»
5. Вернёшься на карту

### 2.3 Список спотов с distance sort

Тап на tab «Споты» (нижняя нав-панель).

Должен видеть:
- Заголовок «Споты»
- Карточка нового спота:
  - Цветной dot слева (rating 4 = moss-зелёный)
  - Имя «Тестовая поляна»
  - Tag-line «Белый»
  - Meta: «0 м от тебя · 01.05.2026 · ↻» (↻ = pending sync)

Если изменишь GPS на другой координате (через эмулятор Location panel,
например `58.745` / `29.86` ~700м от спота) — обновится «700 м от
тебя».

### 2.4 Detail спота с компасом

Тап на спот в списке.

Должен увидеть:
- Header «Тестовая поляна»
- **Компас-кольцо** в центре, chanterelle стрелка указывает в
  направлении спота от тебя
- **Расстояние** большим текстом (e.g. «700 м»)
- KV-блок: rating / coords / created / синк
- Заметка (если ты её ввёл)
- Tag chips (если есть)
- Кнопка «Удалить спот» внизу (ярко-красная)

⚠️ **Magnetometer на эмуляторе не работает** — стрелка будет
показывать в одно фиксированное направление. На реальном телефоне
будет вращаться при повороте устройства.

Тапни «Удалить спот» → confirm → вернёшься в список → пусто.

### 2.5 Скачать регион + увидеть на карте

Tab «Настройки» → раздел «Регионы» → «Управление регионами →».

В списке 18 районов. Тапни Гатчинский (~24 МБ).

Прогресс-бар, потом «Скачано · нажми чтобы удалить».

Вернись на карту → должны появиться **выделы Гатчинского** (двигай
карту туда). До скачивания там ничего не было кроме basemap'а.

Status overlay покажет «1 regions» вместо «(spike)».

### 2.6 Тап на выдел (forest popup)

Тапни на любой зелёный полигон выдела.

Должен открыться bottom-sheet:
- Title (например «Берёзовый» или «Сосновый»)
- KV: порода, возраст, бонитет, источник
- Section «Виды по биотопу» с top-5 видов и affinity scores
- Кнопка «Закрыть»

⚠️ Текст «affinity score» — пока через slug (`boletus-edulis`), не
русские имена. Phase 4 polish переведёт на русские.

## 3. Что искать в Logcat

В отдельном Git Bash:

```bash
adb logcat -t 100 *:E ReactNativeJS:V *:S | head -50
```

Норма — пусто или редкие LocationManager информационные строки. Если
появятся:
- `MapLibre error [HTTP] Unable to parse resourceUrl` — pmtiles URL
  кривой, скажи мне
- `Cannot read property 'X' of undefined` JS error → red box на
  устройстве, скрин/копию
- `LocationManager Error: ACCESS_FINE_LOCATION` → permission не дан;
  Settings → Apps → Geobiom → Permissions → Location → Allow

## 4. Чек-лист — что проверить и сообщить

Сообщи **по каждому пункту**: ✅ работает / ⚠️ работает с проблемой /
❌ не работает.

- [ ] APK собрался + установился
- [ ] Карта открылась с **basemap** (дороги/реки/имена)
- [ ] GPS-маркер виден после Set Location
- [ ] FAB «+» открывает Save form
- [ ] Save spot создаёт запись (видно в «Споты» tab)
- [ ] Distance sorted (ближайший вверху)
- [ ] Tap на спот → detail screen с компасом
- [ ] Удаление спота confirm + работает
- [ ] Settings → Регионы → список 18 районов
- [ ] Скачивание Гатчинского с прогресс-баром
- [ ] После скачивания выделы Гатчинского видны на карте
- [ ] Тап на выдел открывает popup с породой + видами
- [ ] Закрытие popup'а через backdrop tap
- [ ] **Phase 4:** Onboarding wizard на fresh install
- [ ] **Phase 4:** Species catalog с фильтрами + detail с сезоном
- [ ] **Phase 4:** Русские имена в popup «Виды по биотопу»
- [ ] **Phase 4:** Cancel скачивания работает
- [ ] **Phase 4:** Network banner при airplane mode

Если хоть что-то ❌ или ⚠️ — пришли скрин + описание. Если всё ✅ —
скажи «всё работает» и пойдём в Phase 4 polish (gorhom bottom-sheet,
cancel-download, update detection) либо в Phase 5 (RuStore submission
prep).

## 5. Что НЕ работает / что отложено

Эти вещи известны и **не нужно сообщать как баги**:

- **Magnetometer на эмуляторе** не вращает стрелку компаса (нет
  железа). Реальный Android — будет.
- **Bundled forest-luzhsky.pmtiles** ещё в APK как Phase 0 placeholder —
  карта спайка показывает Лужский даже без download. Phase 5 удалит.
- **gorhom/bottom-sheet** не внедрён — сейчас RN Modal slide-up.
  Жесты-snap-points в Phase 5.
- **Yandex login** не тестировался в этой сессии. Пробуй если хочешь;
  должен работать после установки `EXPO_PUBLIC_YANDEX_MOBILE_CLIENT_ID`
  в `apps/mobile/.env`.
- **Sync с сервером**: создание спота шлёт его на `/api/mobile/spots/sync`
  только если ты залогинен. Без login споты только локальные. Это by-design.

## 6. Phase 4 polish — добавлено в эту сессию

Кроме базовых пунктов из чек-листа (1-13) проверь также:

### 6.1 Onboarding (первый запуск)

При первом запуске после fresh install / `pm clear ru.geobiom.mobile`
должен открыться 3-шаг wizard:
1. **Welcome** — название Geobiom, описание lead, кнопка «Дальше»
2. **GPS** — объяснение зачем нужен access, кнопка «Разрешить» →
   native permission dialog → если grant'нул → переход дальше
3. **Регионы** — описание download manager'а, кнопка «Открыть регионы»
   (Phase 5 — сейчас просто закрывает onboarding, нужно отдельно
   зайти Settings → Регионы)

После прохождения — `sync_meta.onboarding.completed.v1 = '1'`. На
следующий запуск onboarding не показывается.

### 6.2 Species catalog (tab «Виды»)

Был placeholder, теперь **полный каталог** 25 видов:
- Filter chips сверху (Все · Съедобные · Условно · Ядовитые · Смертельные)
- Per-row: edibility-dot, имя на русском, латинское italic, сезон + edibility
- Tap → species detail с 12-month season strip, forest_types chips,
  ссылка-placeholder на сайт

### 6.3 Forest popup — русские имена

Тап на выдел → popup. Section «Виды по биотопу» теперь показывает
**«Белый гриб»** вместо `boletus-edulis`, **«Подберёзовик»** вместо
`leccinum-scabrum`, и т.д.

### 6.4 Cancel скачивания

В Settings → Регионы → начни download любого района → tap снова на
тот же row пока качается → confirm «Прервать?» → скачивание
останавливается.

### 6.5 Update detection

Если перегенеришь forest.pmtiles на сервере (через
`pipelines/build_district_tiles.py` с новым `--manifest-version`),
при refresh регионов на mobile уже скачанные регионы отметятся как
«Обновление доступно» (caution-цвет) → tap → confirm → пересоздаст
регион (delete + re-download). Phase 4 polish.

### 6.6 Network banner

Включи Airplane mode на эмуляторе → должен появиться **тёмный banner**
сверху карты «Офлайн · карта читается из скачанных регионов».
Если есть pending spots для sync — банner покажет «Офлайн · N спотов
не синкнуто». Выключи Airplane mode → banner пропадёт.

---

Когда дочитаешь этот гайд и пройдёшь сценарии — пиши результат.
