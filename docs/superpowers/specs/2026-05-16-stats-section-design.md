# «Статистика» — раздел интерактивной аналитики Geobiom

**Статус:** design, ожидает user-review · **Дата:** 2026-05-16
**Бренд:** `geobiom` в URL/файлах, `Geobiom` в прозе/UI

---

## Контекст

Geobiom (`geobiom.ru`) — карта лесов и грибных мест ЛО. Данные мощные,
но «исследовательского» среза по ним нет. Нужен раздел **«Статистика»**:
интерактивные цифры/графики по ВСЕМ данным проекта так, чтобы было
интересно и удобно копать. Референс взаимодействия — игровые
стат-сайты (dotabuff, statlocker): KPI-карточки, лидерборды,
профиль-страницы сущностей, тренды во времени, фильтры, сравнение.

**Аудитория:** любопытный исследователь (не «грибник-в-поле» — для
него карта/прогноз; не «учёный» — для него методология). Цель —
data-discovery, «вау, можно копать».

**Разрез сущностей (аналогия dotabuff):**

| dotabuff | Geobiom |
|---|---|
| игрок / профиль | **район** (18, сравниваем и ранжируем) |
| герой | **вид гриба** (~25, своя «мета» и сезонность) |
| матч / history | **VK-пост** (~69k, лента находок во времени) |
| патч / мета | **сезон / погода** (что «в мете» сейчас) |

---

## Решения (журнал)

| # | Развилка | Выбор | Почему |
|---|---|---|---|
| 1 | Структура | **Хаб + профили** | Overview-дашборд + drill-in профили района и вида. И широта, и глубина. |
| 2 | Граница «сырости» | **Функционал на токенах + чистая компонентизация** | Визуальный polish — отдельный проход в Claude Design (отд. фича Anthropic; есть проект «Geobiom»). В репо: рабочий функционал, токен-стилизация, presentation отделена от logic. |
| 3 | Тяжёлые агрегаты | **Precomputed snapshot** (`public.stats_*` + ETL) | Free-tier/egress: запрет на heavy-scan 2.17M+69k на каждый заход. |
| 4 | Погода/прогноз | **ETL читает `forecast.*` read-only, пишет только `public.stats_*`** | Использовать погоду из сестринского репо, не нарушая двусторонний контракт и не делая live cross-schema heavy reads. |
| 5 | Charting | **Recharts**, lazy с `/stats`, обёрнут в локальные chart-компоненты | Быстро для функционального прохода; presentation изолирована → Claude Design переодевает чисто. |
| 6 | Деплой | **Не в прод до user-review.** Автономная сборка → ревью → выкатываем вместе | Явная инструкция пользователя + CLAUDE.md no-action-without-OK. |

---

## Цели / Не-цели

**Цели:**
- `/stats` хаб + профили района/вида + `/stats/model` + `/stats/data`.
- Интерактив: фильтры (год/окно/группа), сортируемые лидерборды,
  hover-детали, сравнение сущностей, drill-in.
- Задействовать ВСЕ домены: породы, почва, погода (сестринский репо),
  AI-классификация VK, выгрузки VK, реестр видов, районы.
- Дёшево по free-tier: всё считается заранее, отдаётся из snapshot.
- Чистая компонентизация под последующий Claude Design проход.

**Не-цели (явно out of scope):**
- Любой визуальный polish сверх токен-системы — это Claude Design.
- Персональная статистика по `user_spot` / агрегации приватных точек
  (нарушает privacy-обещание редизайна; низкий adoption). Отложено.
- Live ML-прогноз как «точность в реальном времени» — модель
  preview/stale (iter-5 в БД, iter-11 в reports). `/stats/model` =
  research-прозрачность с бейджем «в обучении», НЕ «live accuracy».
- Запись в `forecast.*` или `public.*` сестринского репо. Только чтение
  granted `forecast.*` + запись в наши `public.stats_*`.
- Прод-деплой в этой итерации (только после user-review).
- Расширение географии за пределы ЛО, i18n.

---

## Архитектура

### Слой данных — snapshot ETL

`pipelines/build_stats_snapshot.py` — идемпотентный пайплайн,
запускается после VK-ingest / forest re-ingest / по расписанию.
Считает все агрегаты одним проходом и пишет в `public.stats_*`.

- **Источники чтения:**
  - `public.*` нашей БД: `forest_unified` (породы/бонитет/возраст/
    площадь/источник, spatial join → район), `vk_post`
    (`photo_species` JSONB, `date_ts`, `foray_date`,
    `district_admin_area_id`, `photo_prompt_version`), `species`,
    `species_forest_affinity`, `admin_area` (18), `soil_polygon`/
    `soil_type`.
  - `forecast.*` сестринского репо, **read-only** (GRANT уже есть):
    `forecast.prediction`, `forecast.weather_daily`,
    `forecast.district_features`, `forecast.group`.
  - Метрики модели — из файлов сестринского репо
    (`reports/feature_audit_v4/importance.csv`,
    `target_correlation_per_group.csv`) → импортируются как
    статический JSON в `apps/web/src/content/` (а не live; модель
    меняется редко, файлы — артефакт). Путь сестринского репо:
    `C:\Users\ikoch\mushroom-forecast`.
- **Контракт-дисциплина:** мы НЕ пишем `forecast.*` и НЕ пишем
  `public.*` сестринского репо. Мы только читаем granted `forecast.*`
  и пишем в наши `public.stats_*`. Виджет точности модели явно
  помечается preview-бейджем (данные могут быть stale).
- **Migration** `db/migrations/04X_stats_snapshot.sql` — таблицы
  snapshot + индексы + `stats_meta` (генерация: when, source versions,
  freshness). `04X` = следующий свободный номер (после 040).

Snapshot-таблицы (драфт; финал — в плане реализации):
`stats_overview` (KPI), `stats_species_season` (вид × неделя-года ×
год → finds), `stats_species_profile` (вид → агрегаты, top-районы,
co-occurrence, тренд-по-годам), `stats_district_profile` (район →
лес-состав, активность, климат-кривые, гео-черты, «чем известен»),
`stats_vk_timeline` (неделя × группа → posts/finds), `stats_forest`
(порода/бонитет/возраст → площадь, ± по району), `stats_corpus`
(пайплайн-здоровье, распределение классификации, источники леса).

### API

Расширяем существующий `services/api/src/api/routes/stats.py`
(там уже `/api/stats/overview`, `/api/stats/vk/species-now`).
Новые эндпоинты — тонкие, читают только `public.stats_*`
(O(1)/O(rows) по уже посчитанному), Pydantic-валидация, 1h cache:

```
GET /api/stats/overview                 (есть; расширить freshness)
GET /api/stats/seasonpulse?year=&group= → timeline для хаба
GET /api/stats/forest                    → состав леса ЛО (+по району)
GET /api/stats/districts                 → лидерборд районов
GET /api/stats/districts/{slug}          → профиль района
GET /api/stats/species                   → лидерборд видов
GET /api/stats/species/{slug}            → профиль вида (+co-occurrence)
GET /api/stats/model                     → фичи/корреляции/ρ (preview)
GET /api/stats/corpus                    → пайплайн/классификация
```

Контракт-первый: shape фиксируется сейчас, snapshot заполняет.
FastAPI не клеит CORS к error-responses — все ошибки 200-shape с
пустыми массивами + `meta.empty=true`, фронт рендерит «нет данных».

### Frontend

- Lazy nested route `/stats/*` (паттерн lazy-роутов уже есть).
  Страницы: `apps/web/src/routes/stats/{StatsHubPage,
  DistrictsPage,DistrictProfilePage,SpeciesPage,SpeciesProfilePage,
  ModelPage,CorpusPage}.tsx`.
- Компоненты: `apps/web/src/components/stats/` — виджеты
  (`KpiStrip`, `SeasonPulse`, `TrendingSpecies`, `ForestComposition`,
  `MiniLeaderboard`, `WeatherSnapshot`, `CompareDrawer`, …).
- Чарты изолированы: `apps/web/src/components/stats/charts/`
  (`LineChart`, `BarChart`, `Treemap`, `Heatmap`, `AreaStack`) —
  тонкие обёртки над Recharts, тема через CSS-vars
  (`--idx-*`, forest-палитра, district-accents). **Re-skin Claude
  Design = только эти обёртки + CSS-модули, без правок логики.**
- `packages/api-client/src/` — типизированные fetch-обёртки на новые
  эндпоинты (паттерн plain fetch, без react-query).
- Nav: пункт «Статистика» в `apps/web/src/components/layout/Header.tsx`
  `NAV_ITEMS`; роут в `apps/web/src/router.tsx`.
- Page-shell как у `SpeciesListPage`/`MethodologyPage`: `Container`
  + eyebrow + Fraunces H1 + lead + `usePageTitle()`; CSS-модули;
  токены. Никакого hardcoded-цвета — всё через CSS-vars.

---

## Страницы и виджеты

**`/stats` — Хаб.** KPI-strip (выделы / VK-посты / виды / районы /
свежесть) · «Сезонный пульс» (находки по неделям года, стэк по
группам, выбор года, overlay кривой-климатологии — главный
интерактив) · «Сейчас собирают» (топ видов за окно vs прошлый
период, тренд ↑↓) · «Лес ЛО в цифрах» (treemap пород по площади +
бонитет + возраст) · мини-лидерборды (топ районов / топ видов →
клик в профиль) · погода-снэпшот (аномалия сезона).

**`/stats/districts` — лидерборд районов.** Сортируемая таблица:
лес%, доминирующая порода, **активность** (= находки/посты VK на
площадь за сезон — эмпирика, НЕ preview-прогноз), **разнообразие**
(= distinct видов из VK в районе), ср. бонитет, климат-флаг.
Клик → профиль.

**`/stats/districts/:slug` — профиль района.** Шапка (accent + ранг-
бейджи) · состав леса района · таймлайн находок + топ видов района
· климат-кривые (T/осадки/влага почвы по году, аномалии — из
`forecast.weather_daily`) · гео-черты (из
`forecast.district_features`) · «чем известен» (over-index vs LO)
· CompareDrawer (overlay другого района).

**`/stats/species` — лидерборд видов.** Таблица: всего находок,
тренд, пик-месяц, топ-районы, съедобность. Клик → профиль.

**`/stats/species/:slug` — профиль вида.** Шапка (ru/lat,
съедобность, ранг) · кривая сезонности (находки по неделям,
overlay лет) · где растёт (топ-районы + сродство к типам леса из
`species_forest_affinity`) · тренд по годам · co-occurrence
(«собирают вместе с» — basket по `photo_species`-массивам) ·
двойники (similar из реестра, предупреждение).

**`/stats/model` — как устроен прогноз (preview).** Важности фич
(bar) · что движет каждой группой (корреляции, small-multiples) ·
точность ρ по группам (LODO CV) — **бейдж «превью · модель в
обучении»**. Данные из статического импорта reports/.

**`/stats/data` — корпус и пайплайн.** Данные во времени, %
классифицировано, версия промпта · распределение AI-классификации
по видам · источники леса (rosleshoz/copernicus/osm) · честный
блок «что модель НЕ учитывает».

---

## Фазирование

Каждая фаза самостоятельно shippable, сайт всегда рабочий, **прод
не трогаем до user-review всех фаз**.

**Фаза 1 — Backbone.** Migration `04X_stats_snapshot.sql`; пайплайн
`build_stats_snapshot.py` (forest+VK+species+corpus агрегаты,
read `forecast.*`); расширенные эндпоинты в `stats.py`; api-client
типы; Recharts установлен (`npm i --workspace=@mushroom-map/web
recharts`); lazy `/stats` route-skeleton + nav-пункт; chart-обёртки
каркас. *Verify:* `pytest -q` зелёный (shape-тесты эндпоинтов),
`tsc --noEmit` чистый, snapshot отрабатывает на dev-БД, эндпоинты
отдают реальные числа, `/stats` грузится.

**Фаза 2 — Хаб.** KPI-strip, Сезонный пульс, Сейчас собирают, Лес в
цифрах, мини-лидерборды, погода-снэпшот. *Verify:* визуальная
само-проверка через Claude Preview (скриншот, данные не пустые,
интерактив фильтров работает), `tsc`, build не вырос >150KB gzip
сверх Recharts.

**Фаза 3 — Профили.** `/stats/districts` + профиль района;
`/stats/species` + профиль вида (co-occurrence, сродство,
сезонность, сравнение). *Verify:* drill-in из лидерборда открывает
профиль, графики рендерят реальные данные, сравнение работает;
visual self-check.

**Фаза 4 — Модель/Корпус + handoff.** `/stats/model`,
`/stats/data`; импорт reports/ JSON; preview-бейджи; аудит
компонентизации (presentation/logic split) + короткая
tokens/component-contract заметка для Claude Design прохода;
CLAUDE.md + memory: зафиксировать расширенный read-контракт
`forecast.*` и новый раздел в IA. *Verify:* full `tsc`+`pytest`+
build, визуальная само-проверка всех 7 страниц.

---

## Claude Design handoff (контракт компонентизации)

Чтобы визуальный проход прошёл без правок логики:
- Данные/фетч/состояние — в страницах и хуках; виджеты получают
  готовые props (никаких fetch в presentational-компонентах).
- Чарты — только через `components/stats/charts/*` обёртки; цвета/
  шрифты/радиусы исключительно из CSS-vars (`packages/tokens`).
- Каждый виджет — отдельный файл + CSS-модуль; нет inline-стилей с
  захардкоженным цветом; layout через grid/flex с токен-spacing.
- В Фазе 4 — `docs/stats-design-handoff.md`: список компонентов,
  какие CSS-vars/токены задействованы, где точки кастомизации.

---

## Риски / открытые допущения

- **Read-контракт `forecast.*`** (решение #4) — расширяем
  документированный «только forecast.prediction» до granted
  read-only набора. Допущение: GRANT на `weather_daily`/
  `district_features`/`group` действительно есть (Explore-агент
  подтвердил по сестринскому репо; Фаза 1 проверит реальным
  `SELECT` и зафиксирует факт). Если GRANTа нет — fallback:
  ETL-экспорт нужных агрегатов из сестринского репо его же
  скриптом, мы читаем готовый файл. Не блокирует дизайн.
- **Модель stale** (iter-5 в БД) — `/stats/model` подаётся как
  research/preview, не «live accuracy». Бейдж обязателен.
- **VK foray_date ~60% NULL** — сезонность по
  `COALESCE(foray_date, date_ts AT TIME ZONE 'Europe/Moscow')`;
  явная сноска про методику в `/stats/data`.
- **Размер бандла** — Recharts ~100KB gzip; mitigated lazy-роутом
  `/stats` (остальной сайт не тяжелеет).
- **Свежесть snapshot** — `stats_meta` несёт generated_at +
  source-versions; UI показывает «данные на ДАТА».

---

## Что НЕ делаем (фиксируем scope)

Персональная spot-статистика; live-ML-точность; запись в
`forecast.*`/чужой `public.*`; визуальный polish (→ Claude Design);
прод-деплой до ревью; новые домены данных сверх перечисленных;
i18n; гео за пределами ЛО.
