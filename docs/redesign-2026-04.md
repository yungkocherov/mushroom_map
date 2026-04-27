# mushroom-map → geobiom · полный редизайн

**Статус:** все секции дописаны, ожидает self-review и user-review перед push
**Дата:** 2026-04-27
**Brainstorm session:** `.superpowers/brainstorm/6735-1777312627/` (визуальные мокапы посекционно)

---

## Контекст

Существующий сайт `mushroom-map` — интерактивная карта лесов и грибных мест Ленинградской области на FastAPI + React + MapLibre + PMTiles. Данные мощные (~2M полигонов выделов из ФГИСЛК, Copernicus DEM, почвенная карта Докучаевского, реестр видов с матрицей сродства, ВК-наблюдения), фронтенд полу-готов: главная страница `HomePage` (191 строка, hero + виджеты), отдельный `/map` (lazy-loaded, MapView 778 строк с 11+ парами useState), каталог `/species`, кабинет `/cabinet/spots`, методология MDX. Прогноз грибности (`/api/forecast/at`) — не реализован, сестринский репо `mushroom-forecast` готовит ML-модель.

**Почему редизайн.** Текущий сайт читается как «склад данных»: научное содержимое серьёзное, но пользовательский путь не приводит к «что мне делать в субботу». Из рыночного исследования (см. session): белое пятно в категории — *forest-stand-aware planner + private spot vault + day-rating forecast*; русскоязычный грибник плохо обслужен (Mushroom Spot шатковат на ЛО, остальное — форумы); главные user-must-haves — privacy, offline, seasonality, confidence-aware forecast. Цель редизайна: оставить научный фундамент как «слой доверия» под планировщиком, но сделать первый контакт ответом на вопрос «куда поехать в выходные», а не списком слоёв.

**Бренд.** Переименование: `mushroom-map` → **Geobiom** (утверждено 2026-04-27). Tagline — *«лес ленобласти»*.

**Правило капитализации (важно — соблюдать везде):**
- В прозе и UI-копи: **`Geobiom`** (Title Case). Примеры: «Команда Geobiom», `<title>Geobiom — лес ленобласти</title>`, OG-тег `og:site_name = "Geobiom"`.
- В URL, slug-формах, файловых путях, npm-пакетах, env-переменных: **`geobiom`** (lowercase). Примеры: `geobiom.ru`, `staging.geobiom.ru`, `@geobiom/web`, `VITE_GEOBIOM_API_URL`, бакет `geobiom-tiles`.
- В wordmark/логотипе: можно lowercase (`geobiom`) для визуального решения — это исключение специально для логотипа, не распространяется на текст.

**Домен `geobiom.ru`:** принадлежит автору проекта (зарегистрирован, NS на Cloudflare, A-запись пока пустая — настраивается во время фазы 2 при выкатке новой главной).

---

## Журнал решений

| # | Развилка | Выбор | Почему |
|---|---|---|---|
| 1 | Позиционирование | **A — планировщик-первый** | Daily utility — реальный gap для русскоязычного грибника. Научный фундамент работает как «слой доверия» под планировщиком, не как hero. |
| 2 | Рыбалка | **D — крючок в коде** | Из брифа («возможно, рыбалки») — пока опция. Архитектура поддерживает `kind: mushroom \| fish`, IA имеет место под раздел, но в этой итерации — ноль данных, ноль UI. Расширяется через 3–6 мес без перекройки. |
| 3 | Hero когда модели нет | **Прогноз с seeded fixture** | Дизайн идёт впереди модели; правдоподобные детерминированные числа (`hash(district_id, date)` → 0–5, юг/запад теплее, июль–август пик); contract-first API — модель просто заменит источник. Бейдж «превью · модель в обучении» неброский. |
| 4 | Стратегический подход | **Полевой инструмент** (синтез I + II) | Данные и плотность II «Инструмента», но в тёплой светлой обложке I «Полевого журнала». Светлая тема первичная, тёмная — опция. |
| 5 | Композиция главной | **C — карта + читальный угол** | Карта = главная ценность (~65% площади), sidebar 380px несёт editorial-голос (заголовок, скруббер, «сейчас собирают», источники). Разворот атласа, не дашборд. |
| 6 | URL-схема | **ASCII URL + русские лейблы в наве** | SEO/шеринг/совместимость с кодом. `/`, `/species`, `/spots`, `/methodology`. |
| 7 | Правки попапа выдела | без `выдел #`, порода без процентов, без возраста в заголовке, без `запас`/`уклон` | Поля не помогают грибнику. Заголовок — `Берёзовый` (не `Берёзовый, 65 лет`). |

---

## Визуальный язык

### Палитра (существующие токены, без изменений)

| Роль | Hex | Применение |
|---|---|---|
| `paper` | `#f5f1e6` | основной фон |
| `paper-2` | `#ede8d8` | вторичный фон, sidebar-разделители |
| `ink` | `#20241e` | основной текст, активные UI-элементы |
| `ink-2` | `#4a4d44` | body-текст |
| `ink-3` | `#7a7a70` | вспомогательный, метки |
| `forest` | `#2d5a3a` | бренд-зелёный (используется редко) |
| `moss` | `#7a9b64` | eyebrow-метки |
| `chanterelle` | `#d88c1e` | **единственный акцент** — один на экран (CTA, активный день, primary action) |
| `danger` | `#8b2a2a` | ядовитые виды, ошибки |

### Шкала индекса грибности (НОВОЕ)

| Диапазон | Hex | Семантика |
|---|---|---|
| `<1` | `#4a6b40` | холодно · мимо |
| `1–2` | `#5e8050` | мимо |
| `2–3` | `#9bb47a` | слабо |
| `3–4` | `#bcc890` | можно ехать |
| `4–5` | `#d88c1e` | хороший день (chanterelle) |

Семантическая, не «viridis». Тёмно-зелёный = «лес есть, грибов нет», янтарный = «иди». Для дальтоников — вторичная подача через насыщенность + иконку (○ ◑ ●).

### Акценты районов (НОВОЕ, Wildsam-приём)

18 районов ЛО × 1 тёплый цвет каждый. Применяется микро-дозированно: левая обводка карточки района, точка возле названия в попапе, иконка в шапке детального режима. **Не заменяет шкалу прогноза** — это отдельная плоскость идентичности района («Лужский всегда охряный»).

Хранится в `packages/tokens/src/district-accents.ts` как `Record<osm_id, hex>`. Стартовый набор:

```
Выборгский     #3a5e3a    Бокситогорский  #5b3a1f    Подпорожский    #7a4a1c
Приозерский    #5b3a1f    Волховский       #7a4a1c    Гатчинский       #4a5e7a
Всеволожский   #7a4a1c    Тосненский       #a06a18    Ломоносовский    #4a6b40
Лужский        #a06a18    Кировский        #5e8050    Кингисеппский    #4a5e7a
Тихвинский     #7a8c2e    Сланцевский      #7a4a1c    Лодейнопольский  #5e8050
Волосовский    #a06a18    Киришский        #7a8c2e    Сосновоборский ГО #4a5e7a
```

(значения могут быть пересмотрены — главное: стабильный 1-цвет per район.)

### Типографика

| Уровень | Шрифт | Размер | Где |
|---|---|---|---|
| Display | **Fraunces 500** | 38–72px | hero главной, H1 страниц. **Дельта vs существующего: убран из тела.** |
| Section | Inter 500 | 22–28px | разделы внутри страниц, заголовки sidebar-секций |
| Body | Inter 400 | 14–16px | тело, max 65 символов в строке. **Дельта: остаёмся на Inter, не Source Serif** (серифы в малом размере теряют контраст; Fraunces уже несёт «душу» в hero). |
| Mono | JetBrains Mono | 11–14px | табличные числа в попапах, координаты, технические лейблы |
| Eyebrow | Inter 500 | 10–11px | letter-spacing 0.16–0.18em, всё капс, цвет `moss` (`#7a9b64`); маркер раздела |

### Фотография

**Где живёт:** hero страниц `/methodology`, `/about` (внутри `/methodology`), `/species/:slug`. **Не в hero главной** (там карта-герой).

**Стенс:** утренний/вечерний свет, спокойные планы, лес как место, не трофей. Никаких «инстаграм-ракурсов с грибом крупным планом в руке». Источник: Wikimedia Commons + Unsplash CC, всегда с атрибуцией.

**Обработка:** мягкая десатурация (–10..15%), warm tone shift +200K, оверлей `linear-gradient(180deg, transparent 60%, rgba(32,36,30,0.4))` для читаемости текста.

**Manifest:** `apps/web/src/content/photos.json` — список с лицензиями и авторами; `apps/web/public/photos/` — файлы.

### Свет/тьма

Светлая — primary. Тёмная — secondary, переключатель в правом верхнем углу шапки. Дизайн валидируется на светлой; тёмная — производная (paper → paper-dark, ink → ink-dark, акцент chanterelle тот же). Оставляем существующий dark-режим из `tokens.css`.

---

## Архитектура информации

### Навигация (4 пункта)

`Карта · Виды · Споты · Методология`

- **«Карта»** — главная (`/`); overview ЛО → клик в район → детальный режим
- **«Виды»** — каталог + карточка (`/species`, `/species/:slug`)
- **«Споты»** — приватный кабинет (`/spots`); анонимный заход → промежуточный экран входа, не агрегации
- **«Методология»** — зонтик: источники данных, модель, о проекте, авторы, журнал изменений, юридическое (`/methodology`, `/methodology/:slug`)

### Маршруты

```
/                        → MapPage в режиме «обзор ЛО» (новое — сейчас это HomePage)
/map                     → 301 redirect на /
/forecast                → 301 redirect на /
/map/:district           → MapPage с детальным районом (slug = osm-id, e.g. luzhsky)
/species                 → каталог (нав-лейбл «Виды»)
/species/:slug           → карточка вида
/spots                   → кабинет (нав-лейбл «Споты»)
/spots/:id               → детальная страница спота (новое)
/methodology             → хаб (нав-лейбл «Методология»)
/methodology/:slug       → статья (forest-data, vk-pipeline, species-registry, model, about, authors, changelog, privacy, terms)
/about                   → 301 redirect на /methodology/about
/guide                   → 301 redirect на /methodology
/legal/privacy           → 301 redirect на /methodology/privacy
/legal/terms             → 301 redirect на /methodology/terms
/auth/*                  → без изменений
```

### Главная (overview)

```
[Header: geobiom · Карта Виды Споты Методология · RU/тема/войти]

[Sidebar 380px]                     [Карта 65% — full-bleed choropleth по 18 районам]
  eyebrow «Грибная погода»            • Цвет района = индекс на выбранную дату
  H1 «Ленинградская область»          • Hover/click — район → flyTo + детальный режим
  lead 1 предложение                  • Якорные города: СПб, Луга, Тихвин, Выборг, Лодейное Поле
  Date scrubber 7 пилюль (пн–вс)      • Шкала справа (5 уровней индекса)
  «Сейчас собирают» (топ-3 видов)     • Подсказка снизу: «Кликни район...»
  Источники (одна строка) + методолог. • Spotlight ⌘K hint справа
  Дата + бейдж «превью · модель в    • Бейдж «превью» внизу слева (ровно один на экран)
   обучении»
```

### Детальный режим района

Клик по району из обзора → плавный flyTo на bbox (~1.2 сек), choropleth по районам → слой выделов (по умолчанию **Породы**).

```
[Sidebar 380px]                     [Карта — выделы района, цвет по выбранному слою]
  «← вся область» (один breadcrumb)   • Кликаемые полигоны выделов
  ● Лужский (точка accent-цвета)      • При клике на выдел — плавающий попап
  H1 название района                  • Шкала справа меняется под слой
  lead-описание (доминирующие         • Layer-grid 2×4 — выбранный слой подсвечен
   породы и площадь района)
  Индекс крупно (e.g. 4.2 / 5)
  Layer-grid 2×4 (Прогноз/Породы/
    Бонитет/Возраст/Почва/Рельеф/
    Споты)
  «В районе сейчас» (топ-3 видов
    отфильтровано district)
  Источники + методология
```

### Layer-система (7 слоёв)

| Слой | Источник | Что красит | Авторизация |
|---|---|---|---|
| **Прогноз** (default) | `/api/forecast/districts` (overview) или `/api/forecast/at` (per-выдел в детальном) | choropleth по индексу 0–5 | нет |
| **Породы** | `forest_polygon.dominant_species` (PMTiles) | по доминирующей породе | нет |
| **Бонитет** | `forest_polygon.meta.bonitet` (PMTiles) | I (тёмно-зел) → V (светло) | нет |
| **Возраст** | `forest_polygon.meta.age_group` (PMTiles) | молод. (светло) → спел. (тёмно) | нет |
| **Почва** | `soil.pmtiles` + `/api/soil/at` (popup) | тип почвы | нет |
| **Рельеф** | `hillshade.pmtiles` (raster) | hillshade overlay (полупрозрачный) | нет |
| **Споты** | `/api/cabinet/spots` | приватные точки пользователя (5 цветов) | требуется логин |

### Попап выдела (с правками пользователя)

```
[Заголовок Fraunces]                     ← без «Выдел #...», без возраста
  Берёзовый
  ─────────────────────────────────────
[JetBrains Mono табличные поля]          ← без `запас`, без `уклон`, порода без процентов
  порода       берёза
  возраст      65 лет (приспев.)
  бонитет      II
  почва        подзолистая суглинок
  до воды      280 м (ручей)
  ─────────────────────────────────────
[Inter — секция «Виды по биотопу»]       ← из species_forest_affinity
  1. Подберёзовик · сродство 0.92
  2. Белый (берёзовая форма) · 0.55
  3. Подосиновик · 0.40
  ─────────────────────────────────────
[Inter подвал]
  ФГИСЛК · 60.62, 30.10        Сохранить точку  ← chanterelle CTA, единственный
```

---

## Шаблоны вспомогательных страниц

### `/species` каталог

- Eyebrow «Виды грибов и ягод» + H1 «21 вид из реестра проекта»
- Edibility-чипы primary-фильтр (все · съедобные · условно-съедобные · несъедобные · ядовитые)
- Spotlight-поиск ⌘K (тот же глобальный)
- Сетка 4×N карточек: фото 60px высоты, имя (Fraunces), латинское (Inter italic), edibility-точка + сезон-краткий
- Edge-цвет карточки по edibility (зелёный/жёлтый/серый/красный)
- На ядовитых — иконка `!` в правом верхнем углу
- **В v1: 2/3 видов получают реальное фото; остальные — палитра-плейсхолдер по edibility**

### `/species/:slug` карточка вида

- Hero 130px: фон-фото + градиент-вуаль; eyebrow «Гриб · съедобный» + Title (Fraunces) + латинское (Inter italic) + breadcrumb «← все виды» поверх
- Двухколоночное тело:
  - **Слева:** «Где растёт» (1 абзац) + «Сезон» (12-месячная полоска с цветом интенсивности)
  - **Справа:** «Похожие виды» (с предупреждением для двойников), «Сродство к лесу» (mono-bar чарт по `species_forest_affinity`), CTA «Открыть на карте →» (chanterelle)

### `/spots` кабинет

- Двухпанельный: список слева (340px), мини-карта справа со всеми пинами
- Eyebrow «Мои споты» + H1 «N сохранённых мест»
- Lead: «Видишь только ты. Никаких агрегаций, ничего не публикуется.» (privacy-обещание явно)
- Чипы: все · этим летом · по цвету · «+ добавить» (chanterelle)
- Каждый спот: цветная точка + название + метаданные (сезон/вид/координаты) + дата
- Цвета: forest, chanterelle, birch, moss, danger (5 существующих)
- Анонимный заход → промежуточный экран входа (`AuthGate`)

### `/methodology` хаб

- Eyebrow «Откуда мы это знаем» + H1 «Методология проекта» + lead 1 абзац
- Каталог 4 секций (двухколоночный grid):
  - **Источники данных:** Лесные выделы (ФГИСЛК), Рельеф (Copernicus), Почвенная карта (Докучаевский), ВК-наблюдения и пайплайн, Реестр видов и сродство к лесу
  - **Модель прогноза:** Как считается индекс (с бейджем «в работе»), Что модель не учитывает
  - **О проекте:** Зачем это всё, Авторы и контакты, Журнал изменений
  - **Юридическое:** Политика конфиденциальности, Условия использования

### `/methodology/:slug` статья

- Двухколоночный reading layout:
  - **Левый sidebar 160px:** «← все статьи», TOC текущей статьи (активный пункт — chanterelle border-left), «Источники» (список ссылок)
  - **Тело 640px:** eyebrow-категория + H1 (Fraunces 24px) + lead абзац + body (Inter 14px / 1.65 line-height)

---

## Мобайл

Viewport baseline: 390px (iPhone 13/14/15).

### Главная (overview)

- Шапка: logo + гамбургер
- Hero-секция (компактная): eyebrow + H1 + lead + горизонтально-скроллируемый scrubber дней
- Карта: ≥60% высоты, choropleth с тапаемыми районами
- Низ-навигация: 4 круглых иконки-таба (Карта · Виды · Споты · Методология)
- Подсказка снизу-слева: «Тапни район ↑»

### Детальный режим

- Узкая шапка района: «← обзор · ● Лужский · 4.2»
- Layer-чипы: горизонтально-скроллируемая лента (вместо grid 2×4 десктопа)
- Карта на оставшееся
- Тап на выдел → bottom-sheet попап с тремя snap-высотами:
  - **peek** (заголовок типа леса)
  - **mid** (заголовок + основные mono-поля + виды)
  - **full** (на весь экран — добавляется секция «Где этот вид встречается рядом»)
- Свайп вверх/вниз управляет высотой

### Не делаем в этой итерации

- Push-нотификации
- Friend-граф
- GPS-breadcrumb «вернуть к машине»
- Offline-trip (скачать район для офлайна) — это поздняя итерация

---

## API-дельта

### Новые эндпоинты

**`services/api/src/api/routes/forecast.py`** (нового файла):

```
GET /api/forecast/at?lat=&lon=&date=
  → {
      index: 4.2,                           # 0–5, может быть float
      top_species: [
        { slug: "boletus-edulis", score: 0.42 },
        { slug: "leccinum-aurantiacum", score: 0.31 },
        ...
      ],
      confidence: "preview" | "model",
      generated_at: "2026-05-02T08:00:00Z"
    }

GET /api/forecast/districts?date=
  → [
      {
        admin_area_id: 12345,
        district_name: "Лужский",
        district_slug: "luzhsky",
        index: 4.2,
        top_species: [{ slug, score }, ...]
      },
      ...
    ]
```

**Контракт-дисциплина:** `top_species` всегда `[{slug, score}]` — не голый массив строк. Это compat-первый дизайн: ML-модель будет возвращать вероятности, и frontend сразу научится их рендерить (например, для прозрачности бара). Все `lat/lon/date/q/limit` валидируются через Pydantic-модели на input.

**Реализация v1 (seeded fixture):**
- Детерминированно из `hash(district_id, date)` → 0–5
- Биас: юг/запад чуть теплее севера; пик июль–август; дождь как «случайные» бусты
- `confidence: "preview"`
- **Контракт фиксирован сейчас** — модель из `mushroom-forecast` заменит источник без изменений во фронте, только `confidence: "model"`

**`services/api/src/api/routes/places.py`** (нового файла):

```
GET /api/places/search?q=&limit=10
  → [{ kind: "settlement"|"lake"|"river"|"district", name, lat, lon, district_admin_area_id }]
```

Источник: существующая таблица `gazetteer_entry`, поиск trgm по `name` + `aliases`. Используется в Spotlight ⌘K.

### Без изменений

- `/api/forest/at`, `/api/soil/at`, `/api/water/distance/at`, `/api/terrain/at`, `/api/districts/*`
- `/api/species/*`, `/api/stats/*`
- `/api/auth/*`, `/api/cabinet/spots/*`, `/api/user/me`
- `/tiles/*`, `/health`, `/api/healthz`

---

## План рефакторинга

### Что переписывается полностью

- **`apps/web/src/components/MapView.tsx`** (778 строк, 11+ пар useState) → разбираем на:
  - `MapView.tsx` (~150 строк, оркестратор)
  - `useLayerVisibility.ts` (Zustand store) — заменяет 11 пар useState
  - `useMapMode.ts` — состояние «обзор» vs «детальный район», управляет flyTo/fitBounds
  - `useForecastDate.ts` — выбранная дата скруббера, debounce repaint
  - `mapView/layers/forecastChoroplethLayer.ts` — НОВЫЙ слой, читает `/api/forecast/districts`
  - Существующие layer-модули (forest, water, oopt, roads, hillshade, soil, waterway, places, userSpots) — без изменений в логике, подписаны на zustand
- **`apps/web/src/routes/HomePage.tsx`** (191 строка) → удаляется. Виджет «что собирают сейчас» переезжает в Sidebar. Hero-копи и стат-блоки выкидываются.
- **`apps/web/src/components/mapView/utils/popup.ts`** → новый layout попапа (Fraunces заголовок, JetBrains Mono поля, секция «виды по биотопу», CTA «Сохранить точку»). 4 правки пользователя применены.

### Что переодевается (логика та же, токены и layout новые)

- `apps/web/src/routes/SpeciesListPage.tsx` (124 строки) — новые edibility-чипы, edge-цвет карточки
- `apps/web/src/routes/SpeciesDetailPage.tsx` (261 строка) — новый hero (фото + градиент + eyebrow), двухколоночное тело, CTA «Открыть на карте»
- `apps/web/src/routes/CabinetSpotsPage.tsx` (260 строк) → переименовать в `SpotsPage`, добавить мини-карту справа. Эндпоинты `/api/cabinet/spots/*` не меняются.
- `apps/web/src/routes/MethodologyPage.tsx` + `MethodologyArticlePage.tsx` — новый каркас хаба (4-секционный) + двухколоночный article layout (160 + 640)
- `apps/web/src/components/species/{SpeciesCard,EdibilityChip,SeasonBar}.tsx` — рестайлинг под токены
- `apps/web/src/auth/AuthProvider.tsx` — без правок (только изменился потребитель в попапе)

### Что добавляется новым

- **Sidebar component** — `apps/web/src/components/sidebar/{Sidebar,SidebarOverview,SidebarDistrict}.tsx`. Условный рендер по `useMapMode`.
- **LayerGrid** — `apps/web/src/components/mapView/LayerGrid.tsx`, 2×4 чипы для desktop, горизонтальная лента для mobile.
- **DateScrubber** — `apps/web/src/components/sidebar/DateScrubber.tsx`, 7 пилюль + раскрывающаяся «14 дней».
- **BottomSheet** — `apps/web/src/components/mobile/BottomSheet.tsx`, 3 snap-высоты. Зависимости: `@use-gesture/react` + `@react-spring/web` (новые).
- **District accent registry** — `packages/tokens/src/district-accents.ts` (статичная карта `osm_id → hex`).
- **Forecast index palette** — добавить в `tokens.css`: `--idx-0` ... `--idx-4`.
- **Spotlight ⌘K** — `apps/web/src/components/Spotlight.tsx`, поиск по видам / районам / городам.
- **Hero-фотографии** — `apps/web/public/photos/` (15–20 изображений) + `apps/web/src/content/photos.json` манифест.
- **Новые методологические MDX** — `apps/web/src/content/methodology/{about,authors,changelog}.mdx` (каркасы).
- **API: `services/api/src/api/routes/forecast.py`** — два эндпоинта + seeded-fixture логика.
- **API: `services/api/src/api/routes/places.py`** — search для Spotlight.

### Что выкидывается

- Старые маршруты-плейсхолдеры (`/guide`, `/forecast` placeholder) → 301 редиректы
- Старая HomePage и связанные компоненты (стили, виджеты-секции)
- `apps/web/src/routes/AboutPage.tsx` (108 строк) → контент переезжает в `apps/web/src/content/methodology/about.mdx`, `/about` → 301
- CSS-модули, не привязанные к переехавшим компонентам (после миграции — пройтись `tsc --noEmit` + ручной orphan-чек)
- ~~Старый `mm:save-spot` custom event → заменён прямым вызовом `useSpots().add()` через store~~ — **отменено по результатам adversarial-review:** popup MapLibre рендерится вне React-tree, хуки оттуда не работают. Оставляем event-bus pattern как есть, при необходимости даём popup-у callback-ref для imperative API.

### Что НЕ трогаем

- DB-схема (`forest_polygon`, `species_registry`, `vk_post`, `admin_area`, `spots`, `users`, `user_refresh_token`)
- Все ingest-pipelines (`ingest_forest.py`, `ingest_vk.py`, `load_gazetteer.py`, `ingest_districts.py`, etc.)
- Существующие PMTiles (`forest`, `water`, `waterway`, `wetlands`, `oopt`, `roads`, `protective`, `felling`, `hillshade`, `soil`)
- Auth (Yandex OAuth + refresh-token rotation + reuse detection)
- Сестринский репо `mushroom-forecast` — он отдаст числа в наш `/api/forecast/*` контракт, когда будет готов

---

## Критические файлы (пути для исполнителя)

**Frontend — основной редизайн:**
- `apps/web/src/router.tsx` — обновление маршрутов и редиректов
- `apps/web/src/components/MapView.tsx` — рефакторинг
- `apps/web/src/components/sidebar/` — новая папка (Sidebar/Overview/District)
- `apps/web/src/components/mapView/LayerGrid.tsx` — новый
- `apps/web/src/components/mapView/layers/forecastChoroplethLayer.ts` — новый
- `apps/web/src/components/mapView/utils/popup.ts` — переписать
- `apps/web/src/components/mobile/BottomSheet.tsx` — новый
- `apps/web/src/components/Spotlight.tsx` — новый
- `apps/web/src/store/` — новая папка (useLayerVisibility, useMapMode, useForecastDate)
- `apps/web/src/routes/{SpeciesListPage,SpeciesDetailPage,SpotsPage,MethodologyPage,MethodologyArticlePage}.tsx` — переодеть
- `apps/web/src/routes/HomePage.tsx` — удалить
- `apps/web/src/routes/AboutPage.tsx` — удалить (контент → MDX)

**Tokens:**
- `packages/tokens/src/tokens.css` — добавить `--idx-0..4`
- `packages/tokens/src/district-accents.ts` — новый

**Backend:**
- `services/api/src/api/routes/forecast.py` — новый
- `services/api/src/api/routes/places.py` — новый
- `services/api/src/api/main.py` — зарегистрировать новые routes

**Контент:**
- `apps/web/src/content/methodology/{about,authors,changelog}.mdx` — новые каркасы
- `apps/web/src/content/photos.json` — манифест
- `apps/web/public/photos/` — 15–20 изображений

**Документация:**
- `CLAUDE.md` — обновить «Architecture — the contract» секцию, добавить geobiom-naming решение
- `docs/architecture.md` — обновить под новую IA и API-контракт прогноза
- `docs/redesign-2026-04.md` — новый документ-историчка с этим спеком

---

## Фазирование и верификация

Работа разбита на **3 фазы**, каждая шипится в prod независимо. Между фазами сайт всегда в рабочем состоянии — нет «полусобранного» месяца. Все три фазы — отдельные PR-ы, мержатся последовательно.

### Фаза 1 · Фундамент (1.5–2 нед, невидимая для пользователя)

**Цель:** подготовить инфраструктуру нового дизайна, не меняя ничего видимого. Существующий сайт продолжает работать без изменений.

**Что делаем:**

- **Tokens:** `packages/tokens/src/tokens.css` — добавить `--idx-0..4` (5 цветов индекса). Создать `packages/tokens/src/district-accents.ts` со статичной картой 18 районов.
- **Backend:** новые роуты `services/api/src/api/routes/forecast.py` (с seeded fixture) и `services/api/src/api/routes/places.py`. Регистрация в `services/api/src/api/main.py`. Pytest-кейсы на shape-контракт (response matches schema, deterministic для одной даты, разные даты дают разные значения, edge: `date < today`, `date > today + 14 дней`).
- **Frontend store/scaffolding:** новая папка `apps/web/src/store/` с пустыми Zustand-сторами `useLayerVisibility.ts`, `useMapMode.ts`, `useForecastDate.ts` (логика, ещё без UI-потребителей). Папка `apps/web/src/components/sidebar/` с скелетами компонентов (props-API определены, рендер пустой). То же для `mobile/BottomSheet.tsx`, `Spotlight.tsx`, `mapView/LayerGrid.tsx`.
- **Migrate /about → MDX:** перенести содержимое `apps/web/src/routes/AboutPage.tsx` в `apps/web/src/content/methodology/about.mdx` БЕЗ удаления старого файла (старый роут пока работает). Это страховка.
- **Photos manifest scaffold:** создать `apps/web/src/content/photos.json` с пустым массивом + 1–2 примера, чтобы тип-сигнатура была, и Vite-импорт работал.

**Дельта в `package.json`:** добавить `zustand`, `@use-gesture/react`, `@react-spring/web`, `cmdk` (для Spotlight). Один `npm install --workspace=@mushroom-map/web ...` из репо-root.

**Verification (фаза 1):**
- `npm run build` проходит, бандл не вырос больше чем на 30 КБ gzip
- `pytest -q` проходит, новые тесты на forecast-fixture зелёные
- `npx tsc --noEmit` без ошибок
- Существующий тестовый набор (pytest API smoke + unit) — без регрессий
- **Установить Playwright как зависимость v1.49+** (`npm install -D --workspace=@mushroom-map/web @playwright/test`) и `npx playwright install chromium`. Если уже установлен — пропустить. Создать `apps/web/playwright.config.ts` (baseURL → dev-server, headless по умолчанию) и пустую папку `apps/web/tests/`. Это инфраструктура для phase-2/3 spec-файлов.
  - TODO(phase-2): `npx playwright install chromium` failed in sandbox (offline browser download blocked). Run on dev machine before first spec is added. Config + `tests/` дир уже коммитнуты — устанавливать только бинарь.
- Ручной QA: открыть текущий сайт на staging — ничего визуально не изменилось

**Откат:** revert PR-1, ничего у пользователя не сломается (фаза была невидимой).

### Фаза 2 · Новая оболочка + главная карта (2.5–3 нед, главное видимое изменение)

**Цель:** новая главная страница работает; карта стала героем; маршрутизация обновилась; попап выдела перерисован. Каталог видов, кабинет и методология пока в старом виде.

**Что делаем:**

- **MapView рефакторинг:** разбить 778-строчный файл на компоненты (см. секцию «План рефакторинга»). Layer-модули подписаны на `useLayerVisibility`. Никакого нового UI, но архитектура чистая.
- **Sidebar component complete:** `SidebarOverview` рендерит eyebrow + H1 + lead + DateScrubber + «Сейчас собирают» + источники + бейдж. `SidebarDistrict` — после клика по району.
- **`forecastChoroplethLayer.ts`:** новый MapLibre-слой по 18 районам, читает `/api/forecast/districts?date=`. Цвет → `--idx-N`.
- **District accent применён:** в `SidebarDistrict` и в попапе — точка перед названием района.
- **DateScrubber:** 7 пилюль (текущая неделя), раскрывающаяся «14 дней вперёд».
- **LayerGrid (desktop):** 2×4 чипы в `SidebarDistrict`. Layer «Споты» с лейблом «войти» если не auth, без блокировки модалкой.
- **Popup редизайн:** Fraunces заголовок без `выдел #` и без возраста, JetBrains Mono поля без `запас`/`уклон`, секция «виды по биотопу», CTA «Сохранить точку» (chanterelle).
- **BottomSheet (mobile):** 3 snap-высоты (peek/mid/full), свайп через `@use-gesture/react`. Заменяет popup на ≤768px.
- **LayerStrip (mobile):** горизонтальная лента chips вместо grid 2×4.
- **Bottom-nav (mobile):** 4 круглых таба `Карта · Виды · Споты · Методология`.
- **Router:** `/` → `MapPage`, `/map` → 301, `/forecast` → 301, `/map/:district` (новый), `/about` → 301, `/guide` → 301, `/legal/*` → 301. Обновить SW precache list.
- **Удалить:** `HomePage.tsx`, `AboutPage.tsx`, старые placeholder-роуты. Удалить `mm:save-spot` event-bus, заменить на `useSpots().add()`.
- **CLAUDE.md:** обновить секции «Architecture — the contract» (главная = карта), «URL-схема», добавить новые tokens.
- **OG/SEO главной:** обновить `<title>`, meta-description, OG-image. Главная теперь продаёт «грибную погоду на завтра».

**Дельта в `package.json`:** ничего нового (всё установлено в фазе 1).

**Verification (фаза 2):**
- Новые Playwright spec-файлы:
  - `apps/web/tests/home-overview.spec.ts` — `/` рендерит choropleth по 18 районам (data-testid="district-N" имеет цвет из палитры), DateScrubber активирует `сб`-пилюлю, клик в район активирует flyTo и меняет sidebar
  - `apps/web/tests/district-detail.spec.ts` — `/map/luzhsky` рендерит выделы (по умолчанию слой Породы), переключение слоя в LayerGrid меняет цвета, клик по выделу открывает попап с правильными полями
  - `apps/web/tests/popup-shape.spec.ts` — попап содержит заголовок без числа выдела, mono-таблица с 5 строками (порода, возраст, бонитет, почва, до воды), секция «Виды по биотопу» с тремя строками
  - `apps/web/tests/redirects.spec.ts` — `/map`, `/forecast`, `/about`, `/guide`, `/legal/*` отдают 301 на правильные таргеты
- Ручной mobile QA на iPhone (Safari): bottom-sheet снапается на 3 уровня, свайп работает плавно (target 60fps), горизонтальная лента слоёв скроллится без багов
- Manual QA checklist в репо: `docs/qa-phase-2.md` (создать) — со скриншотами «как должно выглядеть»
- Performance: LCP на главной < 2.0s на 4G slow throttle (Lighthouse), initial bundle для `/` < 600 КБ gzip (текущий — 323 KB после lazy-load; новая главная тяжелее, бюджет — 600)
- Visual regression: одна Playwright-snapshot на главную (desktop 1280×800), одна на детальный режим, одна на попап
- A11y: `axe-playwright` на главной — 0 violations; tab-navigation работает (Tab → Sidebar → Карта → Layer-grid → выдел → попап → close)
- Сестринский репо `mushroom-forecast` уведомлён через CLAUDE.md там, что контракт `/api/forecast/*` зафиксирован

**Откат:** revert PR-2. Главная вернётся в старый вид. API endpoint `/api/forecast/*` останутся (с фазы 1) — безвредно.

### Фаза 3 · Каталог, споты, методология, polish (1.5–2 нед)

**Цель:** все вспомогательные страницы переодеты под новый язык. Готовность к лончу.

**Что делаем:**

- **`/species` каталог:** новые edibility-чипы, сетка 4×N с edge-цветом по edibility, иконка `!` на ядовитых, плейсхолдер-палитра для видов без фото. Compact `SpeciesCard`.
- **`/species/:slug` карточка:** hero с фото-фоном + градиент-вуаль, eyebrow + Title + латинское, двухколоночное тело (где растёт + сезон / похожие + сродство к лесу + CTA «Открыть на карте»).
- **`/spots` (бывший `/cabinet/spots`):** двухпанельный (список + мини-карта), 5-цветный цвет-фильтр, lead-текст про privacy явный, AuthGate для анонимов. Эндпоинты `/api/cabinet/spots/*` без изменений (URL роута меняется в роутере, бэкенд не трогаем).
- **`/spots/:id` страница спота:** новая, минималистичный template — полная карта вокруг точки + название + заметка + edit/delete.
- **`/methodology` хаб:** 4-секционный grid каталог (источники / модель / о проекте / юридическое).
- **`/methodology/:slug` статья:** двухколоночный reading layout (160px TOC + 640px тело), eyebrow-категория, Fraunces H1.
- **Новые MDX-каркасы:** `about.mdx`, `authors.mdx`, `changelog.mdx` с placeholder-контентом (наполнение — отдельной фазой контентной работы).
- **Spotlight ⌘K:** глобальный поиск по видам / районам / городам. Хитит `/api/species/search`, `/api/places/search`, `/api/districts/`.
- **Hero-фотографии:** загрузить 15–20 изображений в `apps/web/public/photos/`, заполнить `apps/web/src/content/photos.json` (URL, автор, лицензия, alt-текст). Применить обработку по styleguide.
- **Удалить старые ассеты:** orphan CSS-модули, старые компоненты `species/EdibilityChip` v1 если изменились, etc.
- **Финальный CLAUDE.md update:** новый IA, новые компоненты, новые скрипты.

**Дельта в `package.json`:** `cmdk` уже стоит с фазы 1.

**Verification (фаза 3):**
- Новые Playwright spec:
  - `apps/web/tests/species.spec.ts` — каталог фильтруется по edibility (счётчики совпадают с реестром), детальная карточка содержит сезон-полоску + похожие + CTA «Открыть на карте» с правильным ?species= в URL
  - `apps/web/tests/spots.spec.ts` — анонимный заход → AuthGate, после login список рендерится, click на спот → flyTo на мини-карте, добавление спота через форму создаёт запись (используем существующие `cabinet-crud-regression.spec.ts` как фундамент)
  - `apps/web/tests/methodology.spec.ts` — хаб содержит 4 секции, статья имеет TOC с активным пунктом, breadcrumb «← все статьи» работает
  - `apps/web/tests/spotlight.spec.ts` — `⌘K` (Cmd+K на mac, Ctrl+K на Windows) открывает Spotlight, ввод 3+ символов триггерит fetch, выбор результата делает navigate
- Manual QA checklist `docs/qa-phase-3.md`
- Performance: bundle для `/species` детальной < 350 КБ gzip (был 261 строк компонент)
- A11y: `axe-playwright` на `/species`, `/species/:slug`, `/spots`, `/methodology`, `/methodology/:slug` — 0 violations
- Hero photos: все 15–20 проходят атрибуцию (CC лицензия, автор указан в manifest), все весят < 200 КБ после WebP-конверсии
- Broken link check: `npx linkinator https://staging.geobiom.ru` — 0 broken
- SEO: каждая страница имеет уникальные `<title>` и meta-description, OG-теги для шеринга
- Visual regression snapshot на каждую новую страницу (desktop + mobile)

**Откат:** revert PR-3. Главная и карта (фаза 2) останутся, /species, /spots, /methodology вернутся к фазе 2 виду (который сам по себе уже — переходный, но рабочий).

---

## Стратегия выката

**Стейджинг → прод для каждой фазы.**

1. PR мержится в `main` после code review (один человек кроме автора, можно использовать `/ultrareview` для AI-second-opinion).
2. CI прогоняет: `tsc --noEmit`, `pytest -q`, Playwright smoke (full `apps/web/tests/`), build.
3. Авто-деплой в staging (`staging.geobiom.ru`) — сейчас не настроен, **новая работа фазы 1**: docker-compose-staging + GitHub Actions deploy job (~1 день).
4. Manual QA по `docs/qa-phase-N.md` чек-листу — на staging.
5. Если ОК — manual `bash scripts/deploy/sync_db_to_remote.sh` + `docker compose -f docker-compose.prod.yml up -d` на prod-VM. (Это уже задокументировано в существующем `docs/deployment.md`.)
6. Smoke-чек прод после деплоя: открыть главную, проверить что forecast-data отдаётся, попап выдела работает, login.
7. Ждать 24 часа prod без откатов перед стартом следующей фазы.

**Rollback procedure (если что-то поломалось в prod):**
```bash
# на prod-VM
git -C /opt/mushroom-map fetch origin
git -C /opt/mushroom-map reset --hard <previous-stable-sha>
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```
PMTiles на R2 — не трогаем (один и тот же URL обслуживает любую версию фронта).

**Feature-flag fallback (опционально, для фазы 2):** добавить env `VITE_HOMEPAGE=legacy|new`. Если выкатили новую главную и users жалуются — `VITE_HOMEPAGE=legacy` на staging без revert. Это страховка для самой рискованной фазы (главная — лицо продукта).

---

## Что НЕ делаем в этом редизайне (явно)

Чтобы не было соблазна расширять scope в процессе:

- **ML-модель прогноза** — живёт в сестринском репо `mushroom-forecast`. Мы только зафиксировали API-контракт. Когда модель готова — она просто заменит seeded fixture, фронт не узнает.
- **Push-нотификации, friend-граф, GPS-breadcrumb «вернуть к машине», offline-trip** — это III «Компаньон»-территория, не наша.
- **Рыбалка** — только архитектурный крючок (`spots.kind: mushroom | fish` в БД), ноль данных, ноль UI.
- **Расширение географии за пределы ЛО** — в спеке нет, отложено до момента, когда forecast-модель будет работать стабильно для ЛО.
- **Полноценный i18n** — сайт остаётся русским. Английский — позже, отдельным проектом, когда модель будет давать осмысленные числа за пределами ЛО.
- **Push-уведомления о прогнозе («индекс в твоём районе вырос»)** — отложено до релиза реальной модели; нет смысла спамить про fixture.
- **Социальные ссылки на споты** (друзья, sharing) — нарушает privacy-обещание; не в этой версии.
- **K-anonymous heatmap «куда чаще ездили»** — отложено до момента, когда наберём достаточно spot-данных от пользователей для агрегации (минимум 100 активных пользователей).
- **Контент методологии** — каркасы делаем, реальные статьи (О проекте, Авторы, Changelog) пишутся отдельной фазой контентной работы, после релиза каркасов.

---

## Что нужно сделать после утверждения спека (предимплементационное)

- [x] **Self-review спека** — выполнен 2026-04-27 (исправлено: typo «сквоттер», уточнено бренд-имя как требующее подтверждения, ослаблено предположение про Playwright).
- [ ] **User review** — ты читаешь спек целиком.
- [x] **Подтвердить бренд-имя** — **Geobiom** утверждено 2026-04-27. Капитализация: `Geobiom` в тексте, `geobiom` в URL/файлах, lowercase допустим в wordmark.
- [x] **Проверить домен** — `geobiom.ru` принадлежит автору (parked at Cloudflare, A-запись подключим в фазе 2).
- [x] **`.gitignore` check** — `.superpowers/` добавлен в .gitignore (commit `4120015`).
- [x] **commit + push спека** — выполнено 2026-04-27 (`origin/main` @ `4120015`).
- [ ] **Создать GitHub-issue** на каждую из 3 фаз с чек-листом задач (или Linear-проект, если есть).
- [x] **Старт фазы 1.** — выполнено 2026-04-27.

---

## Phase 1 progress (autonomous run, 2026-04-27)

- [x] 1.1 — tokens: `--idx-0..4` palette (commit `78e4285`)
- [x] 1.2 — tokens: `district-accents.ts` 18 hue-distinct (HSL, commit `fe88044`)
- [x] 1.3 — api: `forecast.py` + 22 unit tests (commit `51752c9`)
- [x] 1.4 — api: `places.py` + 7 unit + 3 smoke tests (commit `5d65af1`)
- [x] 1.5 — web: zustand stores `useLayerVisibility / useMapMode / useForecastDate` (commit `b399488`)
- [x] 1.6 — web: component skeletons `Sidebar*`, `LayerGrid`, `BottomSheet`, `Spotlight` (commit `5005f24`)
- [x] 1.7 — web: `about.mdx` mirror, additive (commit `46fee78`)
- [x] 1.8 — web: `content/photos.json` scaffold (commit `b1284e0`)
- [x] 1.9 — web: `playwright.config.ts` + `tests/.gitkeep` (commit `2d4a4bb`)
  - TODO(phase-2): `npx playwright install chromium` — bin install blocked in sandbox.
- [x] 1.10 — verification: `tsc --noEmit` clean, `pytest -q` 29 passed / 3 smoke skipped.

**Outstanding TODOs surfaced during Phase 1:**
- TODO(phase-2): chromium binary install on dev machine.
- TODO(phase-2): real district-slug column on `admin_area` (transliteration), replace `code[len("osm_rel_"):]` shortcut in `forecast.py:_district_slug_from_code`.
- TODO(phase-3): real photos for `content/photos.json`, fill author/license.

## Phase 2 partial (autonomous run continued, 2026-04-27)

- [x] 2.a — `forecastChoroplethLayer.ts`: source reuses `districts`, `step` paint expression on feature-state index, fetchAndApplyForecast convenience (commit `4d2e0b9`)
- [x] 2.b — `DateScrubber` substantive: 7/14-day pills, mono pills, today eyebrow, focus ring (commit `8885941`)
- [x] 2.c — `SidebarOverview` substantive: eyebrow + Fraunces H1 + lead + preview badge + DateScrubber + top-5 with district accent dots + sources (commit `7f1e751`)
- [x] 2.d — `useForecastDistricts` hook with in-memory cache; SidebarOverview migrated to it (commit `3a2afec`)
- [x] 2.e — MapView additive wiring: forecast layer registered alongside districts, controller effect subscribes to `useLayerVisibility` + `useForecastDate` (commit `66d1ea8`)

**Phase 2 Outstanding (not done in this autonomous run):**
- MapView 778-line decomposition (extract layer modules into a single dispatcher, replace 11 useState pairs with `useLayerVisibility` reads). High-risk in unattended mode.
- Popup redesign per spec (Fraunces title, JetBrains Mono fields, no vydel/запас/уклон, top species section, CTA).
- SidebarDistrict substantive impl + LayerGrid impl + accent application.
- Router redirects: `/map` `/forecast` `/about` `/guide` → 301; `/` swap to MapPage.
- BottomSheet impl (deps `@use-gesture/react` + `@react-spring/web` not yet installed).
- HomePage.tsx + AboutPage.tsx deletion (after `/` swap to MapPage).
- OG/SEO meta on the new home.

State: site visually unchanged; new layer hidden by default; SidebarOverview not mounted in any route yet (Phase 2.f, deferred). `npx tsc --noEmit` clean across all touched files; `pytest -q` 29 passed / 3 smoke skipped (no live API in sandbox).

---

## Ссылки на ресурсы brainstorm-сессии

Все мокапы и промежуточные решения сохранены в:
```
.superpowers/brainstorm/6735-1777312627/content/
  positioning.html             — выбор позиционирования
  fishing-scope.html           — выбор рыбалки
  forecast-hero.html           — выбор hero
  approaches.html              — три стратегических подхода
  approach-blended.html        — синтез I+II
  hero-map-first.html          — первая попытка map-first
  hero-spectrum.html           — три промежуточных варианта (A/B/C/D)
  hero-c-fullsize.html         — финальный C в нормальном масштабе
  visual-language.html         — секция 1
  map-detail.html              — секция 2
  mobile.html                  — секция 3
  aux-pages.html               — секция 4
  waiting-refactor.html        — заглушка для секции 5 (текстовая)
```

Рыночное исследование, на котором базируются позиционные решения: см. отдельный отчёт от research-agent (12 конкурентов, 12 интеракционных референсов, 7 data-driven референсов, 12 цвет/тип-референсов, top-5 что работает / top-5 frustrations, 7 anti-patterns) — содержимое в transcript этой сессии.
