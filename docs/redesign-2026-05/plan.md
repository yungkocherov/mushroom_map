# Geobiom Redesign 2026-05 — план перехода

**Статус 2026-05-10: SHIPPED.** Phase W0 → W6 + V + 3 polish-волны
живут в production (geobiom.ru / app.geobiom.ru). Текущий exit-state
зафиксирован в memory `project_redesign_2026_05.md` — там список
commit'ов, архитектурные финалы, что не вошло (отложено), gotcha'и
найденные в Phase V.

Этот файл оставлен как исторический spec — проектные решения, decision
log и token map по-прежнему действительны для будущих волн полировки.

**Источник дизайна:** [docs/redesign-2026-05/claude-design/](claude-design/)
— распакованный архив `Geobiom.zip` (claude-design сессия 2026-05-08).

**Версия дизайна:** «01 · v2» (refined organic), модули
`d1v2.jsx` + `d1v2-suite.jsx` + `d1v2-hybrids.jsx`. Лого — **H1 Hybrid
Classic** (`LogoHybrid1`): сосна слева + боровик справа от ствола +
контурная линия снизу. Дышит 5s ease.

**Цель:** максимально близко к дизайну. Ребрендинг + перестройка IA +
новые routes + перевёрстка карты в floating-panels. Web и mobile-native
синхронно (одна волна, один token-swap).

**Не делаем:** custom MapLibre paint patches под палитру дизайна
(basemap остаётся Versatiles Colorful как есть). Откладываем в
опциональную Phase 7 если визуал слишком расходится после остального
ребрендинга.

---

## 1. Inventory: что портируется, что новое

| Дизайн-компонент | Файл-источник | Куда едет в проекте |
|---|---|---|
| `LogoHybrid1` (H1 Classic) | `d1v2-hybrids.jsx:39-48` | `Logo.tsx` (web) + `Logo.tsx` (mobile, через `react-native-svg`) |
| `Wordmark` (mark + Geobiom + sub) | `d1v2.jsx:92-105` | `Wordmark.tsx` (web), нав-логотип в Header |
| `D1VLanding` | `d1v2.jsx:263-350` | новый `LandingPage.tsx` на `/` |
| `D1VMap` (full-bleed + 3 floating cards) | `d1v2.jsx:353-457` | переписанный `MapHomePage.tsx` на `/map` |
| `D1VSpecies` | `d1v2-suite.jsx:125-215` | refactor `SpeciesDetailPage.tsx` |
| `D1VAddSpot` (rating + pill-tags) | `d1v2-suite.jsx:14-122` | refactor `SaveSpotModal.tsx` |
| `D1VOnboarding` (3-step wizard) | `d1v2-suite.jsx:314-411` | новый `OnboardingPage.tsx` на `/onboarding` |
| `D1VCalendar` (12-month ribbon) | `d1v2-suite.jsx:218-311` | новый `CalendarPage.tsx` на `/calendar` |
| `D1VBrand` (brand guide) | `d1v2-suite.jsx:414-544` | MDX-статья `/methodology/brand` |
| `IndexMeter` (animated bar) | `d1v2.jsx:215-250` | shared component, используется в Right panel и Calendar |
| `PulsePin` (animated marker) | `d1v2.jsx:253-260` | DOM-overlay компонент для user spots поверх MapLibre |
| `IconPin/IconSearch/IconStar/...` | `shared.jsx:58-147` | заменяет lucide-react иконки в местах brand-touchpoint (header, search, layers, mobile bottom-nav). Lucide остаётся в methodology MDX и админ-UI. |
| keyframes (`d1v-pulse`, `d1v-breathe`, `d1v-fadeup`, `d1v-myco`, `d1v-grow-x`, etc.) | `d1v2.jsx:26-49` | переезжает в `apps/web/src/styles/animations.css` (импорт из `main.tsx`) |
| `.d1v-card` / `.d1v-btn` hover/transition | inline в JSX | глобальные классы `.card-interactive` / `.btn-interactive` в `global.css` |

**Не портируется** (design-tool runtime, не наш дизайн):
- `design-canvas.jsx`, `tweaks-panel.jsx`, `tweaks-app.jsx` — Figma-like
  оркестратор артбордов, не имеет отношения к нашему UI
- `D1VLogoLab` / `D1VLogoLab2` / `D1VHybridLab` — exploration-tools для
  выбора лого; выбор сделан, лаб не нужен
- `D1VReel` / `D1VMorph` — анимационные демо для презентации
- `StylizedMap` (SVG fake карта) — у нас MapLibre

---

## 2. Token map (old → new)

Все цвета swap'ятся в [packages/tokens/src/tokens.css](../../packages/tokens/src/tokens.css)
и [packages/tokens/src/index.ts](../../packages/tokens/src/index.ts) одним
коммитом. Mobile (`native.ts`) переэкспортирует `palette` из `index.ts` —
swap проедет автоматически.

### 2.1 Light palette

| Token | Сейчас | Новый | Назначение |
|---|---|---|---|
| `--paper` | `#f5f1e6` | `#f4ede0` | фон страницы (D1V.bg) |
| `--paper-rise` | `#fcf9f0` | `#ede4d2` | карты, панели (D1V.paper) |
| `--cream` *(новый)* | — | `#faf5e8` | модалки, floating cards |
| `--ink` | `#20241e` | `#2a2620` | основной текст |
| `--ink-dim` | `#4f4e45` | `#5b5346` | вторичный текст |
| `--ink-faint` | `#5e5d52` | `#8a8270` | tertiary, captions |
| `--rule` | `#d8d2c0` | `rgba(0,0,0,0.08)` | hairlines |
| `--forest` | `#2d5a3a` | `#3e4827` | primary (D1V.mossDeep) |
| `--forest-deep` | `#1a3a24` | `#2a3019` | hover state |
| `--moss` | `#4d6b40` | `#5d6a3a` | edible badge, аффинити |
| `--birch` | `#e8e2d1` | `#e0d8c2` | hover bg |
| `--chanterelle` | `#d88c1e` | `#b86a3a` | accent (D1V.terra) — terracotta |
| `--amber-deep` | `#a86b0f` | `#9a5a30` | hover accent |
| `--bark` *(новый)* | — | `#7a5a3a` | осенние акценты, гумус |
| `--danger` | `#8b2a2a` | `#8b2a2a` | *оставить* — токсичные виды |
| `--caution` | `#855410` | `#855410` | *оставить* — conditional-edible |
| `--idx-0..4` | сохранить | сохранить | forecast scale работает |
| `--focus-ring` | `#d88c1e` | `#b86a3a` | sync с новым accent |

### 2.2 Dark palette

Дизайн dark mode не показывает. Калибрую под новую палитру руками:
`forest` → lightened `mossDeep`, `terra` → lightened с сохранением
теплоты. Контраст AA против `paper-dark` — обязательное условие.

### 2.3 Шрифты

| Стек | Сейчас | Новый |
|---|---|---|
| `--font-display` | Fraunces Variable | Fraunces Variable *(оставляем)* |
| `--font-body` | Inter Variable | Inter Variable *(оставляем)* |
| `--font-mono` | JetBrains Mono | **IBM Plex Mono** (новый — координаты, метаданные) |
| `--font-hand` *(новый)* | — | **Caveat** (рукописные акценты) |

`@fontsource-variable/jetbrains-mono` → удалить из package.json.
Добавить `@fontsource/ibm-plex-mono` + `@fontsource/caveat`.

### 2.4 Type scale

Дизайн использует более крупные display-размеры (88px hero, 64px
species name). Текущий ramp (42px display max) не покрывает. Расширяю:

| Token | Сейчас | Новый |
|---|---|---|
| `--fs-hero` *(новый)* | — | `clamp(2.75rem, 5vw + 1rem, 5.5rem)` (44→88px) |
| `--fs-display` | 2.625rem (42px) | `clamp(2rem, 3vw + 1rem, 4rem)` (32→64px) |
| `--fs-h1` | 2rem | 2.25rem (36px) |
| остальные | — | без изменений |

Hero на mobile (<720px) — clamp обеспечит ≤44px без overflow.

### 2.5 Лого SVG-токены

Новые exports в `@mushroom-map/tokens`:

```ts
export const logo = {
  primary: 'LogoHybrid1',
  defaultSize: { sm: 24, md: 36, lg: 56, xl: 96 },
  defaultPadding: 0.25, // safe area = 1/4 высоты знака
} as const;
```

Реальный SVG живёт в `apps/web/src/components/Logo.tsx` и
`apps/mobile/components/Logo.tsx` (mirrored).

---

## 3. IA / routing changes

### 3.1 Web routes diff

| URL | Было | Стало |
|---|---|---|
| `/` | `MapHomePage` (карта-как-дом) | **`LandingPage`** (hero + map cameo) |
| `/map` | `301 → /` | **`MapHomePage`** (full-bleed + floating) |
| `/map/:district` | `MapPage` district detail | **`MapHomePage`** с `mapMode='district'` |
| `/calendar` *(новый)* | — | `CalendarPage` |
| `/onboarding` *(новый)* | — | `OnboardingPage` (3-step wizard) |
| `/methodology/brand` *(новый)* | — | MDX brand guide |
| `/species`, `/species/:slug` | без изменений | refactored visual |
| `/spots`, `/spots/:id` | без изменений | refactored visual |
| `/methodology/*` | без изменений | без изменений |
| `/auth/*` | без изменений | без изменений |
| `/cabinet/*` | без изменений | без изменений |
| `/legal/*` | без изменений | без изменений |

301-redirect `/forecast → /` остаётся (legacy). Добавляется 301
`/about-legacy` *(уже есть)* и проверка что `/home-legacy` ведёт куда
надо. Текущие 301'ы на `/methodology/:slug` снимаются — статьи
методологии разблокированы.

### 3.2 Header navigation

```
Geobiom · лес ленобласти    Карта · Виды · Споты · Календарь · Методология    [Войти]
```

Изменения от текущего:
- «Сохранённые места» переименовываются в «Споты» (компактнее, как в
  дизайне)
- добавляется «Календарь» (`/calendar`)
- логотип увеличивается (см. 4.1)
- стиль ссылок — underline-on-hover через `::after` (`d1v-link` в
  дизайне), не background-fill

### 3.3 First-visit onboarding

При первом заходе (`localStorage.getItem('geobiom_onboarded') !== '1'`)
— `/` редиректит на `/onboarding`. После завершения ставится флаг,
дальше показывается обычный Landing. В future, при auth, флаг
синхронизируется с user-record (отложено).

### 3.4 Mobile native screens

Mobile уже использует Expo Router file-based routing
(`apps/mobile/app/`). Существующие screens:
- `app/(tabs)/` — bottom tabs
- `app/onboarding.tsx` — **уже есть**, перерабатывается под D1V стиль
- `app/regions.tsx` — список районов
- `app/species/`, `app/spot/` — детальные screens

Изменения:
- `app/onboarding.tsx` — port D1VOnboarding 3-step
- `app/(tabs)/_layout.tsx` — bottom-tab visual: ink-soft inactive,
  moss-deep active с background pill (как в `D1VMobile:520-527`)
- `app/(tabs)/index.tsx` (карта) — top search bar + chips strip + bottom
  sheet stay; visual refresh под D1V
- `components/Logo.tsx` — новый SVG-компонент

Routing сам не меняется.

---

## 4. Phasing

Каждая фаза — отдельный merge-able кусок. Mobile идёт **в той же фазе**
что и web где применимо (token swap, лого, page ports). Чисто
web-структурные фазы (routing) не имеют mobile-аналога.

### 4.0 Conventions & strategy (применяется к каждой фазе)

**Testing pyramid per phase:**
- **Vitest unit tests** (`apps/web/src/**/*.test.tsx`) — covers
  component logic, store selectors, utility functions. Каждый новый
  компонент — минимум один render-test (mounts без error +
  default-state assertion).
- **Vitest integration** (`apps/web/src/test/`) — covers hook
  interactions, store-component bindings.
- **Playwright e2e** (`apps/web/tests/e2e/` — добавляется в W2 если
  ещё нет) — covers user journeys через реальный браузер. После W4 —
  обязательный e2e на «open map → toggle layer → click polygon →
  popup».
- **Visual regression** (опционально, не блокирующий) — Playwright
  screenshot diffing на ключевые pages перед/после фазы.
- **Phase V** smoke tests (manual через Chrome MCP) — обязательно
  per-phase + full walk-through перед prod deploy.

Acceptance каждой фазы включает «зелёные tests» = unit + integration
+ existing e2e + Phase V smoke smoke-сценарии затронутых страниц.

**JSX → CSS Modules porting convention:**

Дизайн в `claude-design/src/*.jsx` использует inline-styles:
```jsx
<div style={{padding:24, background:D1V.cream, borderRadius:16}}>
```

Конвертация в проект:
```tsx
// Component.module.css
.card {
  padding: var(--space-5);
  background: var(--cream);
  border-radius: var(--radius-lg);
}

// Component.tsx
import styles from "./Component.module.css";
<div className={styles.card}>
```

Шаги:
1. Извлекаем все `style={{...}}` → классы в `*.module.css`.
2. `D1V.cream` → `var(--cream)` (token); `padding:24` → `var(--space-5)`
   (24 ≈ 1.5rem); `borderRadius:16` → `var(--radius-lg)`-ish или новый
   token если систематически.
3. Animation keyframes из `d1v2.jsx:26-46` живут в общем
   `apps/web/src/styles/animations.css` (импорт из main.tsx); классы
   `.d1v-card` → `.card-interactive` глобально.
4. SVG-иконки и `Logo` остаются inline-JSX (это не styling, это markup).

**Component API conventions для новых компонентов:**

```ts
// Logo.tsx
type LogoProps = {
  size?: number;            // px, default 56
  color?: string;           // hex, default var(--forest)
  accent?: string;          // hex, default var(--chanterelle)
  breathe?: boolean;        // animation, default true; disabled через prefers-reduced-motion
  ariaLabel?: string;
};

// Wordmark.tsx
type WordmarkProps = {
  size?: "sm" | "md" | "lg";  // default "md"
  showSub?: boolean;          // "лес ленобласти" subtitle, default true
  variant?: "default" | "onDark"; // для dark backgrounds
};

// IndexMeter.tsx
type IndexMeterProps = {
  value: number;          // 0..1
  total?: number;         // bar segments, default 14
  big?: boolean;          // larger variant for hero/right-panel
  dark?: boolean;         // for dark surfaces
  label?: string;         // override default "индекс плодоношения"
};

// PulsePin.tsx
type PulsePinProps = {
  lng: number;
  lat: number;
  color?: string;     // var(--chanterelle) | var(--moss) | var(--bark)
  size?: number;      // diameter, default 12
  delay?: number;     // animation phase offset, default 0
  label?: string;     // optional Caveat-font label below
  map: maplibregl.Map; // for projection
};

// Pill.tsx
type PillProps = {
  on: boolean;
  onToggle: () => void;
  children: ReactNode;
  ariaLabel?: string;
};

// MapTopBar / MapLayersPanel / MapForecastPanel — receive store via
// hooks (useLayerVisibility, useMapMode, useForecastDate), не через
// props. Single source of truth преcerved.
```

**Rollback strategy для solo-push в main:**

Каждая фаза — один или несколько коммитов с осмысленными
message'ами. После phase commit + push:

1. `gh run list` — CI зелёный
2. Phase V smoke прошёл локально
3. Production smoke (`curl https://geobiom.ru/`, `https://app.geobiom.ru/`)

При обнаружении регрессии в течение 24 часов после deploy:
- **Косметический баг** → fix-forward (новый commit поверх)
- **Functional break** → `git revert <commit-sha>` + push, потом
  диагностика и retry в worktree

`feedback_fix_dont_revert.md` ремark — не откатывать косметику,
только functional. План фаз спроектирован так что Phase W1
(token swap) и Phase W2 (routing) — атомарные revert'абельные. Phase
W4 (map full-bleed) — самая сложная для отката, нужен особо
внимательный Phase V прогон.

**Per-phase commit hygiene:**

- Каждая фаза — отдельный merge в main. Не сливать W1 + W4 в один
  push (различный risk profile, разный revert).
- Commit-message: `redesign(W1): tokens swap + Logo Hybrid component`
- При finishing каждой фазы — update memory (`MEMORY.md` +
  `project_redesign_2026_05.md`) с exit-state (см. iteration workflow
  в CLAUDE.md).

### Phase W0 — Pre-flight audits *(small, ≤1 день, blocking)*

Без прохождения W0 не стартуем W1. Все аудиты **обязательны**, результат
фиксируется в `docs/redesign-2026-05/audits/` (новая папка) либо
прямыми commit'ами правок в обнаруженных файлах.

**A0.1 — Hardcoded colors audit.** Расширенный grep по
`apps/web/src/`, `apps/mobile/`, `services/api/`, `services/geodata/`:

```bash
# Hex (covers full + shorthand)
grep -rEn "#[0-9a-fA-F]{3,8}\b" apps/web/src apps/mobile --include="*.{ts,tsx,css,scss}"
# rgba/rgb/hsl/hsla
grep -rEn "(rgba?|hsla?)\(" apps/web/src apps/mobile --include="*.{ts,tsx,css,scss}"
# Named colors that aren't tokens
grep -rEn "\b(white|black|gray|grey|red|blue|green|yellow|orange)\b" apps/web/src apps/mobile --include="*.{ts,tsx,css}" | grep -v "var(--"
```

Каждый match классифицировать: (a) уже использует `var(--token)` →
ОК; (b) inline rgba для shadow/transparency → ОК если совпадает с
новой палитрой; (c) hardcoded → переписать на `var(--token)` ИЛИ
явно акцептовать в audit-log с обоснованием. SVG `fill`/`stroke` —
часто hardcoded, мигрируют на `currentColor` или `var()`.

**A0.2 — Cyrillic font support verification.** Проверить что:
- `@fontsource-variable/fraunces/cyrillic.css` импортирован (для
  hero 88px)
- `@fontsource/caveat/cyrillic.css` (или `@fontsource/caveat/cyrillic-400.css`
  + `cyrillic-500.css` etc.) импортирован для handwritten акцентов
- `@fontsource/ibm-plex-mono/cyrillic.css` для координат/мета

Тест: открыть `index.html` с `font-family: var(--font-hand)` на блоке
русского текста, screenshot. Если рендерится Caveat (handwritten
shape) — OK. Если serif fallback — добавить cyrillic subset.

Если у Caveat **нет** cyrillic subset вообще (по `@fontsource/caveat`
README) — fallback на italic Fraunces 18-24px вместо handwritten;
зафиксировать в `tokens.css` как `--font-hand` с серифным
fallback'ом, не использовать Caveat.

**A0.3 — Sidebar dependents grep.** До W4:

```bash
grep -rEn "from .*sidebar/(Sidebar|SidebarOverview|SidebarDistrict|LayerInfoPanel)" apps/web/src
```

Каждый импорт — план миграции (переезд содержимого в floating panel
или удаление). Без этого W4 ломает routes неявно.

**A0.4 — JetBrains Mono dependents grep.** До удаления:

```bash
grep -rEn "JetBrains|jetbrains-mono|var\(--font-mono\)" apps/ services/ packages/
```

Если используется только в web `--font-mono` (что value-swap'ится) —
remove safe. Если в `apps/mobile` или MDX prose code-blocks
явный `font-family` — обновить на IBM Plex Mono или сохранить
JetBrains как secondary mono token.

**A0.5 — Mobile hardcoded color audit.** Тот же grep что A0.1 но
focused на `apps/mobile/`. Mobile RN использует StyleSheet с
hardcoded numbers/strings — без миграции на `palette.light` token swap
не повлияет.

**A0.6 — `services/observability` consumer check.** Проверить
GlitchTip + Umami self-host'нутые dashboards — используют ли они
наши шрифты или цвета? Если да — отдельный update issue.

**A0.7 — Supply chain audit для новых npm packages.** Перед install:

```bash
npm view @fontsource/caveat versions --json | head -5
npm view @fontsource/ibm-plex-mono versions --json | head -5
# Check for known CVEs
npm audit --package-lock-only
```

Verify maintainer (`fontsource`-org должен быть verified), последний
update в течение 12 месяцев, no high/critical vulns. Если есть
high — поднять issue, искать alternative или fork.

**Acceptance Phase W0:**
- Все 6 audit'ов завершены, report'ы в `docs/redesign-2026-05/audits/`
- Все hardcoded colors либо мигрированы на токены, либо явно
  акцептованы с обоснованием
- Cyrillic subsets для всех шрифтов подтверждены или есть fallback
- Список Sidebar dependents с migration plan для каждого
- W1 разблокирован

### Phase W1 + M1 — Tokens, шрифты, лого *(small, ≤2 дня)*

**Цель:** одним коммитом переодеть весь существующий UI через CSS-vars
+ запустить новый Logo. Pure brand swap, без структурных изменений.

**Files:**
- `packages/tokens/src/tokens.css` — все переменные из 2.1, 2.2, 2.4
- `packages/tokens/src/index.ts` — sync TS-константы
- `packages/tokens/src/native.ts` — sync если нужно (палитра идёт через
  index.ts автоматически, но новые токены `cream`/`bark` могут
  требовать ручного export)
- `apps/web/package.json` — `+@fontsource/ibm-plex-mono`,
  `+@fontsource/caveat`, `−@fontsource-variable/jetbrains-mono`
- `apps/web/src/main.tsx` — импорт новых fontsource
- `apps/web/src/components/Logo.tsx` — **новый**, port `LogoHybrid1`
- `apps/web/src/components/layout/Header.tsx` — `<Logo />` вместо
  `<img src=icon-192.png>`, fontSize bump для brand-title
- `apps/web/src/components/Wordmark.tsx` — **новый** (mark + name + sub)
- `apps/web/public/icon-*.png` — regenerate из нового SVG (16, 32, 192,
  512)
- `apps/web/public/manifest.webmanifest` — apple-touch-icon, theme_color
- `apps/mobile/components/Logo.tsx` — **новый**, RN-port через
  `react-native-svg` (зависимость уже есть)
- `apps/mobile/assets/icon.png` + `adaptive-icon.png` + `splash.png` —
  regenerate из SVG
- `apps/mobile/app.json` — `expo.icon`, `splash.image`, theme color

**Acceptance:**
- Web запускается локально, header показывает новый Logo H1 + Wordmark
- Все существующие страницы (Methodology, Species, Spots, Map, Auth)
  визуально перекрашены через CSS-vars без поломок layout
- Light + dark mode работают
- Mobile native собирается (Android `expo prebuild && expo run:android`),
  иконка приложения и splash — новые
- Lighthouse-prod (если есть в CI) не упал больше чем на 2 балла

**Risks:**
- Hardcoded цвета — covered Phase W0 (A0.1, A0.5).
- **Bundle size**: IBM Plex Mono — multiple weights (400, 500, 600) ×
  cyrillic + latin subsets ≈ +180-240KB total. Caveat — single weight
  cyrillic+latin ≈ +60KB. Combined +240-300KB к initial JS bundle.
  Mitigation: load только нужные weights через `@fontsource`
  granular imports (`@fontsource/ibm-plex-mono/400.css` not
  `@fontsource/ibm-plex-mono` — last loads all). Critical first-load
  budget = +200KB max.
- **Logo PNG regen**: команда — Sharp via Node script
  `scripts/build/regenerate-icons.js` (новый, читает `Logo.tsx` через
  `react-dom/server` renderToStaticMarkup → SVG → Sharp resize → PNG
  16, 32, 64, 192, 512). Альтернатива manual: Inkscape CLI
  `inkscape logo.svg -o icon-N.png -w N` для каждого размера.
  Default: build-script (повторяемо).
- **JetBrains Mono dependents** — covered Phase W0 (A0.4). Если найдены
  consumers — оставляем `--font-mono-secondary: "JetBrains Mono"` token,
  не удаляем package.

### Phase W2 — Routing & Header *(small, ≤1 день, web only)*

**Цель:** `/` ↔ `/map` swap, добавить новые routes (placeholders OK),
переписать Header nav.

**Files:**
- `apps/web/src/router.tsx`:
  - `{ index: true, element: <LandingPage /> }` (плейсхолдер)
  - `{ path: 'map', element: <MapHomePage /> }`
  - `{ path: 'map/:district', element: <MapHomePage /> }`
  - `{ path: 'calendar', element: <CalendarPage /> }` (плейсхолдер)
  - `{ path: 'onboarding', element: <OnboardingPage /> }` (плейсхолдер)
  - `/methodology/:slug` 301 **оставляем** на этой фазе — конкретные
    статьи разблокируются только когда контент готов (Phase W6 включает
    как минимум `/methodology/brand`; статьи методологии остальные —
    open). Если в фазе разблокированы конкретные slug'и — тогда
    в `router.tsx` add per-slug routes, общий 301-fallback остаётся.
- `apps/web/src/components/layout/Header.tsx` — обновить `NAV_ITEMS`,
  переименовать «Сохранённые места» → «Споты», добавить «Календарь»,
  поменять стиль ссылок на underline-on-hover (`::after`)
- `apps/web/src/components/layout/Header.module.css` — `.link`,
  `.linkActive` под новый стиль
- `apps/web/src/routes/LandingPage.tsx` — placeholder (Phase W3 наполнит)
- `apps/web/src/routes/CalendarPage.tsx` — placeholder
- `apps/web/src/routes/OnboardingPage.tsx` — placeholder
- `apps/web/src/components/layout/Layout.tsx` — first-visit redirect:
  - проверка `localStorage.getItem('geobiom_onboarded')`
  - **только** при `pathname === '/'` (не редиректить с `/species`,
    `/methodology` и т.д. — текущие visitors могут иметь bookmark на
    deep-link, не должны видеть onboarding)
  - **only redirect** если `Cookies.get('auth_session') === undefined` —
    залогиненные юзеры пропускают onboarding (server-side track will
    follow в future)
  - **migration**: deploy через rolling — на первый rollout добавляем
    flag через JS-snippet один раз для известных existing visitors;
    альтернатива — feature-flag `enable_onboarding=false` на 2 недели
    после deploy, потом `true`. Default решение: feature-flag через
    `localStorage.getItem('geobiom_show_onboarding')` — set'ится
    скриптом deployment'а на cookie-free browsers (новички). Existing
    юзеры с auth-cookie или с known localStorage не попадут.
  - **open redirect защита**: если onboarding принимает `?next=`
    параметр — валидировать что начинается с `/` и не `//evil.com`
    (relative-only). Default: НЕ принимать `next` — после onboarding
    всегда `/`.

**Acceptance:**
- `/` показывает Landing-плейсхолдер
- `/map` показывает существующую карту (из MapHomePage до Phase W4)
- `/calendar`, `/onboarding` показывают плейсхолдер «скоро»
- Header показывает 5 nav-ссылок в правильном порядке
- First-visit (incognito) → редирект на `/onboarding`
- Все существующие 301'ы продолжают работать (`/forecast`, `/guide`,
  `/cabinet/spots`, `/about`)

**Risks:**
- Поломка external-ссылок на `/`. Mitigation: добавить кнопку «Открыть
  карту» на Landing-плейсхолдер сразу же.
- SEO-метатеги для нового `/map`. `useLayerTitle` хук уже есть —
  убедиться что подцепляется.

### Phase W3 + M3 — Landing + Onboarding port *(medium, 2-3 дня)*

**Цель:** реальный Landing на `/` (web), реальный Onboarding на
`/onboarding` (web и mobile).

**Files (web):**
- `apps/web/src/routes/LandingPage.tsx` — port `D1VLanding`:
  - Hero «Лес, как атлас.» с italic terra accent
  - Animated counter "3"-block (18 районов, 25 видов, 72k выделов, 11
    лет) — `IndexMeter`-like animation
  - Mycelium underline под "атлас" (SVG keyframe `d1v-myco`)
  - Map cameo-card с `PulsePin`'ами + mini IndexMeter (data из
    `/api/forecast/districts` если доступно, иначе mock)
  - Contour SVG wash (full-bleed background)
  - 2 CTA: «Открыть карту» (→ /map) + «Как это работает» (→
    /methodology)
- `apps/web/src/components/IndexMeter.tsx` — shared component для
  forecast-bar (используется в Landing, Map right panel, Calendar)
- `apps/web/src/components/PulsePin.tsx` — DOM компонент для маркеров
- `apps/web/src/styles/animations.css` — все keyframes из `d1v2.jsx:26-46`
- `apps/web/src/routes/OnboardingPage.tsx` — port `D1VOnboarding`:
  3 step (геолокация → район → готово), Pill-компонент общий с
  AddSpot, прогресс-bar в top-bar
- `apps/web/src/components/Pill.tsx` — shared toggle pill (used in
  AddSpot, Onboarding, Calendar)
- `apps/web/src/lib/onboardingStorage.ts` — flag в localStorage

**Files (mobile):**
- `apps/mobile/app/onboarding.tsx` — переписать под D1V 3-step стиль
- `apps/mobile/components/Pill.tsx` — RN-port
- `apps/mobile/components/IndexMeter.tsx` — RN-port
- `apps/mobile/lib/onboardingStorage.ts` — AsyncStorage flag

**Acceptance (web):**
- `/` показывает hero, открывается на desktop+mobile, текст помещается
- `IndexMeter` анимируется (число + bars)
- Кнопки CTA работают
- `/onboarding` 3 step проходится, после step 3 ставится флаг и
  редиректит на `/`

**Acceptance (mobile):**
- Onboarding screen на старте отображает 3 step в новом стиле
- AsyncStorage флаг работает

**Risks:**
- `IndexMeter` requestAnimationFrame на не-фоновом tab может
  тормозить — не риск, не sticky. Cleanup на unmount обязателен
  (`return () => cancelAnimationFrame(id)`).
- Animated counter «72k» через requestAnimationFrame — easing должен
  совпадать с дизайном (cubic-bezier(.2,.7,.2,1)).
- Mobile Hero shrinkage — 88px на маленьком экране недопустимо;
  через `--fs-hero: clamp(2.75rem, 5vw + 1rem, 5.5rem)` гарантирует
  44px на 360px экране, 88px на ≥1280px.
- **API-fail fallback для stat counters** — если
  `/api/forecast/districts` падает, hero не должен показывать «0
  районов». Constants как fallback: `[18, 25, 72000, 11]` —
  захардкоженные, обновляются при successful API call. SR-friendly:
  показываем reasonable defaults, не ждём loading.

### Phase W4 + M4 — Map full-bleed floating layout *(large, 3-5 дней)*

**Цель:** удалить grid `Sidebar | MapPane`, перейти на full-bleed
MapView с 3 floating cards. Самая большая работа.

**Files (web):**
- `apps/web/src/routes/MapHomePage.tsx` — переписать layout:
  - Удалить grid CSS
  - `<MapView />` как `position:absolute, inset:0`
  - Поверх — `<MapTopBar />`, `<MapLayersPanel />`, `<MapForecastPanel />`
- `apps/web/src/routes/MapHomePage.module.css` — переписать
- `apps/web/src/components/mapView/MapTopBar.tsx` — **новый**:
  Wordmark (sm) + Search (`<SearchBar>` или `<Spotlight />` trigger) +
  User chip (HeaderAuth re-style)
- `apps/web/src/components/mapView/MapLayersPanel.tsx` — **новый**,
  обёртка над `<LayerGrid floating />`, `<BaseMapPicker />`,
  `<Legend />`. Все три уже существуют, только перекомпоновать в
  одну floating card.
- `apps/web/src/components/mapView/MapForecastPanel.tsx` — **новый**:
  обёртка `<DateScrubber />` + IndexMeter + 1-2 строки текста
  («После дождей… ожидается слой белых»). Responsive:
  - **desktop ≥720px**: right-top floating card (как в `D1VMap:424-437`)
  - **mobile <720px**: card схлопывается в bottom-sheet (`@use-gesture`
    + `@react-spring/web` уже в проекте, см. CLAUDE.md mobile web pattern).
    Snap points: peek (показывает заголовок + большую цифру индекса),
    expanded (полная карточка). Layout swap через CSS media query +
    component-level `useMediaQuery` hook.
- `apps/web/src/components/sidebar/Sidebar.tsx` → удалить (или
  оставить как dead-code на 1 commit для diff-clarity, удалить в
  следующем)
- `apps/web/src/components/sidebar/SidebarOverview.tsx` → контент
  переезжает в LandingPage (district list); компонент удаляется
- `apps/web/src/components/sidebar/SidebarDistrict.tsx` → переписать
  как `<DistrictDetailPanel />` — **left floating card** (на месте
  MapLayersPanel при `mapMode='district'`, MapLayersPanel сворачивается
  в icon-only minified bar bottom-left при district-mode). Содержит:
  название района (Fraunces 28px), IndexMeter (большой), список
  топ-5 species в районе, breadcrumb «← все районы». Reuses
  существующий контракт `useMapMode` + `useForecastDistricts`
- `apps/web/src/components/sidebar/LayerInfoPanel.tsx` → **Radix
  Popover** (не tooltip — long content требует scrollable region и
  click-outside-to-close), привязан к LayerChip в LayerGrid через
  `<Popover.Trigger asChild>`. Триггерится по click на info-icon
  внутри chip (не hover — иначе случайные открытия при move через
  чипы)
- `apps/web/src/store/useLayerVisibility.ts` — без изменений, store
  source-of-truth остаётся
- `apps/web/src/components/MapView.tsx` — без структурных изменений
  (orchestrator), но проверить что `useMapInstance` корректно работает
  с `inset:0` контейнером (а не grid-column:2)

**Files (mobile):**
- `apps/mobile/app/(tabs)/index.tsx` (карта) — visual refresh:
  - Top search-bar в `cream` card style с shadow
  - Chips strip — `mossDeep` active, `cream` inactive (как `D1VMobile:503-507`)
  - Bottom sheet — header (название района + Caveat-accent + IndexMeter)
- `apps/mobile/components/MapTopBar.tsx` — **новый**
- `apps/mobile/components/MapLayerChips.tsx` — refactor существующего
  под новый стиль

**Acceptance (web):**
- `/map` — full-bleed карта без боковой sidebar-колонки
- Top-bar floating с search и user chip
- Left panel (layers) переключаемый, не ломает map при toggle
- Right panel (forecast) показывает IndexMeter + текст
- District-mode (`/map/:district`) — открывает `<DistrictDetailOverlay />`
- Существующие тесты `apps/web/src/test/` — обновлены или зеленые
- Lighthouse не упал ниже текущего baseline

**Acceptance (mobile):**
- Map screen open → top search-bar в новом стиле, chips в новом стиле,
  bottom sheet с IndexMeter
- Регрессии нет: layer toggle, район-выбор, save spot — работают

**Risks (большие):**
- **`grid-column:2` legacy bug в CLAUDE.md** — при переходе на `inset:0`
  больше не актуален, но MapPane может зависеть от parent-layout где-то
  ещё (CabinetPage? SpotDetailPage?). Mitigation: grep всех users
  MapPane/MapView перед merge.
- **`setStyle()` re-add custom sources** — `useBaseMap` уже это решает,
  не сломается при перевёрстке. Проверить что styledata-listener
  переживает изменение container'а.
- **Sidebar ссылки в других страницах**: `CabinetSpotsPage` использует
  свой layout, `SpotDetailPage` — тоже. Скорее всего никто кроме
  MapHomePage не импортирует Sidebar. Grep подтвердит.
- **Mobile bottom-sheet existing impl** уже работает, не ломаем
  контракт `gorhom/bottom-sheet ref-API` (см. memory
  `feedback_gorhom_bottom_sheet.md`).

### Phase W5 + M5 — Page ports *(medium, 2-3 дня)*

**Цель:** перерисовать существующие screens под D1V-стиль. Только
визуал, контракты не трогаем.

**Files (web):**
- `packages/types/src/spotTags.ts` (existing, see CLAUDE.md) — **уже**
  имеет 11 деревьев + 13 грибов + 5 ягод (контракт совпадает с
  `D1VAddSpot:21-23`). Реиспользуем как есть, копировать не надо.
- `apps/web/src/routes/SpeciesDetailPage.tsx` — port `D1VSpecies`:
  - Hero: «N / 25», название Fraunces 64px, латынь italic terra
  - 3 status pills (СЪЕДОБНЫЙ / МИКОРИЗА / N СИНОНИМОВ)
  - Season strip: 12-month grid, peak-month — `mossDeep` filled
  - Synonyms section
  - Photo placeholder с PrimaryLogo на repeating-pattern bg (если фото
    не загружено)
  - Affinity bars: animated `d1v-grow-x`, цвета per-tree (хвойные
    оливковее, лиственные песочнее)
- `apps/web/src/routes/SpeciesListPage.tsx` — refresh card-style под
  cream + shadow + hover-lift
- `apps/web/src/components/SaveSpotModal.tsx` — port `D1VAddSpot`:
  - Header: лого + название + координаты в Plex Mono
  - Rating: 5-button grid с label («плохо/так себе/нейтр./хорошо/отлично»)
  - 3 pill-groups: TREES (11), SHROOMS (13), BERRIES (5) — словарь
    оставляем из `@mushroom-map/types/spotTags`
  - Footer: «видно только тебе» + Cancel + Save
- `apps/web/src/components/Spotlight.tsx` — refresh card-style: cream +
  rounded-14, ⌘K kbd-chip в Plex Mono
- `apps/web/src/routes/SpotDetailPage.tsx` — refresh hero-card style
- `apps/web/src/routes/CabinetSpotsPage.tsx` — refresh list cards под
  cream + shadow
- `apps/web/src/routes/CalendarPage.tsx` — port `D1VCalendar`:
  - Title «Год, как лента.»
  - Ribbon: 12 месяцев × 12 видов
  - Толщина полосы — длительность сезона, dark pixel — пик
  - Текущий месяц подсвечен (terra)
  - Animated `d1v-grow-x` per-row staggered
- `apps/web/src/lib/seasonality.ts` — **новый**, hardcoded
  `{ slug, start, end, peak, color }[]` для 12 видов из дизайна
  (точные значения — `d1v2-suite.jsx:222-234`)

**Files (mobile):**
- `apps/mobile/app/species/[slug].tsx` — port D1VSpecies layout
- `apps/mobile/app/spot/[id].tsx` — port refresh
- `apps/mobile/components/SpotForm.tsx` (если есть) — port D1VAddSpot
  pill-groups
- Calendar в mobile — **не делаем** в этой волне (нет аналогичного
  screen'а в `apps/mobile/app/`). Если потребуется — отдельный issue
  пост-redesign.

**Acceptance:**
- Все port'нутые screens визуально совпадают с дизайном (с допуском
  на typography responsive ramp)
- Существующие feature-tests зелёные (rating-сохранение, tag-toggle,
  search results)
- Bonitet/forest-data API contracts не тронуты

**Risks:**
- Pill-словарь в `@mushroom-map/types/spotTags` (см. CLAUDE.md) уже
  имеет 11 деревьев + 13 грибов + 5 ягод — точно совпадает с
  дизайном (`d1v2-suite.jsx:21-23`). Совпадение неслучайное — дизайн
  делался с учётом контракта.
- Affinity per-species в БД? Если нет — захардкодить из дизайна как
  `species-affinity.json` (уже существует в `apps/mobile/assets/`).

### Phase W6 + M6 — Polish, animations, brand guide *(medium, 2 дня)*

**Цель:** довести анимации и эффекты, добавить brand MDX.

**Files:**
- `apps/web/src/styles/animations.css` — финал: все keyframes,
  `.card-interactive`, `.btn-interactive`, `.link-underline`
- `apps/web/src/components/PulsePin.tsx` — финал: DOM-overlay поверх
  MapLibre с `map.project()` для синхронизации с moves; используется
  для user spots
- `apps/web/src/components/mapView/userSpotsLayer.ts` — switch с
  MapLibre symbol-source на DOM-overlay для spots если их <100
  (otherwise fallback на symbols без анимации)
- `apps/web/src/content/methodology/brand.mdx` — **новый**, port
  `D1VBrand`:
  - Logo system (size variants, on-dark, on-terra, on-light)
  - Palette swatches с hex
  - Typography ramp (Fraunces hero, h2, body, mono, hand)
  - Spacing/radii visual scale
  - Iconography (12 иконок в нашем стиле)
  - Patterns (3 paper textures)
- `apps/web/src/content/methodology/index.ts` — добавить brand article
- `apps/mobile/components/PulseMarker.tsx` — RN port (Animated.View с
  scale loop)

**Acceptance:**
- User spots на карте пульсируют (web и mobile)
- `/methodology/brand` рендерится как MDX-статья в общем стиле
- Hover-lift на карточках (Species cards, Spot cards) работает
- Logo `breathe` animation идёт в Header

**Risks:**
- Pulse-overlay поверх 50+ маркеров: 50 DOM nodes с CSS animation —
  норм. Если у юзера 500 spots — fallback на static (порог = 100,
  логика: при mount считаем `spots.length`; >100 → static markers).
- Mobile pulse через RN Animated — нужно убедиться что не конфликтует
  с map gesture handling.
- `prefers-reduced-motion: reduce` — все animations (breathe, pulse,
  fadeup, drift, myco, grow-x) должны respect via media query в
  `animations.css` (`@media (prefers-reduced-motion: reduce) { * {
  animation-duration: 0.01ms !important; transition-duration: 0.01ms
  !important; } }`).

### Phase V — Pre-prod visual verification gate *(blocking, ≤1 день)*

**Цель:** перед deploy на TimeWeb+Oracle (production) — обязательный
manual + automated прогон всех user-facing scenarios через реальный
браузер. Невозможно поймать visual regressions через Vitest/typecheck
(см. CLAUDE.md feedback `feedback_open_dev_site_yourself.md`).

Проводится **после каждой фазы** (per-phase smoke) и **полным
прогоном перед финальным deploy** (full walk-through).

**Per-phase smoke (обязательно перед commit фазы):**

1. `npm run dev` (host-side, не Docker — см. CLAUDE.md Phase 1 D3)
2. Open Chrome MCP (`mcp__Claude_in_Chrome__navigate http://localhost:5173`)
3. Screenshot главной + 3 ключевых страниц затронутых фазой
4. Click через Spotlight (⌘K) и check что не рассыпается
5. `npx tsc --noEmit` зелёный
6. `npm run test` (Vitest) зелёный
7. `npx playwright test` (если e2e добавлены в фазе) зелёный

**Full walk-through (обязательно перед deploy после Phase W6):**

Сценарии прогоняются вручную через Chrome MCP, фиксируются
скриншотами в `docs/redesign-2026-05/verification/screenshots-{date}/`.
Каждый failed случай — bug-ticket внутри плана + fix перед mergeом.

| # | Scenario | Expected |
|---|---|---|
| 1 | Open `/` (incognito) | First-visit redirect → `/onboarding` |
| 2 | Pass onboarding 3 step | Redirect на `/`, localStorage flag set |
| 3 | Open `/` (after onboarding) | LandingPage с hero, animated counter, map cameo, 2 CTA |
| 4 | Click "Открыть карту" | Navigate to `/map`, full-bleed карта |
| 5 | Switch basemap (Схема/Спутник/Гибрид) | Layers re-add'ятся, не пропадают |
| 6 | Toggle layer chip (Породы/Бонитет/Возраст/etc.) | Layer visibility меняется, legend обновляется |
| 7 | Click forest polygon | Popup с bonitet/age + species-affinity |
| 8 | Press ⌘K | Spotlight открывается, search работает (species + places) |
| 9 | Type "Всеволожский" в Spotlight, click result | Map flies to district, district-mode активен, overlay открывается |
| 10 | Open `/calendar` | 12-month ribbon, current month highlighted |
| 11 | Open `/species/boletus-edulis` | Hero + season strip + affinity bars + photo placeholder |
| 12 | Login через Yandex OAuth | Cookie set, redirect на `/cabinet` |
| 13 | Click "Сохранить место" на карте (auth'ed) | SaveSpotModal открывается с rating buttons + 3 pill groups |
| 14 | Select rating=5, tags={Берёза, Белый}, save | Spot создаётся, появляется на карте с PulsePin |
| 15 | Open `/spots`, click newly-created spot | SpotDetailPage с тегами и rating |
| 16 | Open `/methodology`, click "brand" article | MDX brand guide рендерится в общем стиле |
| 17 | Resize до 360px (mobile portrait) | Header стягивается, hero shrinks через clamp, MapForecastPanel becomes bottom-sheet |
| 18 | Test `prefers-reduced-motion` (Chrome DevTools rendering tab) | Animations отключаются |
| 19 | Open `/legal/privacy`, `/legal/terms` | Не сломаны (regression check) |
| 20 | Open `/auth/error?code=denied` | Error page рендерится в новой стилистике |

**Mobile (Android Expo + RuStore):**

| # | Scenario | Expected |
|---|---|---|
| M1 | First launch (clean install) | Onboarding 3-step в новом стиле |
| M2 | Map screen | Top search-bar + chips + bottom-sheet refresh |
| M3 | Tap forest polygon | Popup с правильной палитрой |
| M4 | Save spot | Pill-groups (TREES/SHROOMS/BERRIES) работают, rating сохраняется |
| M5 | Open species detail | Season strip + affinity bars |
| M6 | Offline mode (airplane) | PMTiles bundled basemap работает |

**Failure handling:** любой failed scenario → bug добавляется в
`docs/redesign-2026-05/verification/bugs.md`, fix'ится в текущей
ветке (worktree), перепроверяется. Deploy на prod заблокирован пока
все scenarios зелёные.

**Tools:**
- `mcp__Claude_in_Chrome__*` — для desktop scenarios 1-20
- Manual Android device или Android Studio emulator — для mobile M1-M6
- Network throttling (Slow 3G) для check что bundle-size acceptable

---

## 5. Repo hygiene (одноразово, перед началом W1)

Распакованный архив сейчас 6.6 MB. Чистим **до** первого коммита Phase W1.

**Точные команды (run from repo root):**

```bash
cd docs/redesign-2026-05/claude-design

# Удаляем uploads/ (дубликаты + скриншоты сессии)
rm -rf uploads/

# Удаляем design-tool runtime
rm -f design-canvas.jsx tweaks-panel.jsx src/tweaks-app.jsx

# Удаляем отвергнутые design-direction варианты
rm -f src/d1-organic.jsx src/d2-atlas.jsx src/d3-modern.jsx \
      src/d4-strava.jsx src/d5-expedition.jsx

# Verify result
du -sh .              # должно быть ~600 KB после чистки
ls src/               # должны остаться: shared.jsx, d1v2.jsx,
                      # d1v2-hybrids.jsx, d1v2-logos.jsx, d1v2-suite.jsx,
                      # app.jsx
```

**Сохранены после чистки:**
- `Geobiom Redesign.html` — точка входа canvas
- `.design-canvas.state.json` — карта секций
- `src/{shared,d1v2,d1v2-hybrids,d1v2-logos,d1v2-suite,app}.jsx` —
  источник истины SVG-лого, keyframes, цветовых hex'ов, mock data
- `assets/logo.png`, `assets/logo-mark.png`, `assets/icon-512.png` —
  для favicon raster

После чистки коммитим **только** содержимое
`docs/redesign-2026-05/claude-design/` как reference (~600 KB) +
`docs/redesign-2026-05/plan.md` (этот файл).

---

## 6. Risks / open gotchas

1. **Basemap не в стилистике дизайна.** Versatiles Colorful насыщеннее
   чем dim-mockup `StylizedMap`. Принимаем как есть, custom paint
   patches — Phase 7 если будет визуальный bump.

2. **Mobile Caveat font** — поддержка handwritten в RN через
   `expo-font`. Должно работать без дополнительной настройки. Если
   падает — fallback на italic Fraunces.

3. **`setStyle()` после basemap-switch** — подтвердить что новые
   floating panels не интерферируют с `useBaseMap` styledata-listener.
   Test case: переключить Versatiles ↔ ESRI satellite, убедиться что
   layers + panels возвращаются.

4. **Pre-hydrate dark-mode script** (`packages/tokens/...` Phase 0) —
   при swap palette проверить что localStorage флаг продолжает
   корректно ставить `data-theme`.

5. **Free-tier tile egress.** Новые шрифты, иконки, lighter assets —
   net добавит ~150KB к first-load. Acceptable, проверить
   Lighthouse + R2 monthly bandwidth не пробивает.

6. **CI (.github/workflows/deploy-{web,mobile}.yml)** — обновить если
   `vite.config.ts` или `package.json` структура поменяется.

7. **`feedback_keep_envs_in_sync.md`** — не оставлять рассинхрон между
   web и mobile при rollout. Каждая фаза — оба коммита одной волной.
   Не мерж в main одной платформы пока другая не догнала.

8. **Тестирование на TimeWeb + Oracle.** После Phase W1 — `gh run list`
   обоих deploy workflows зелёные, `geobiom.ru` и `app.geobiom.ru` —
   живые, новый logo на обоих, header не сломан.

---

## 7. Что не делаем в этом редизайне

- Custom MapLibre paint patches под палитру дизайна (Phase 7
  оптино)
- Backend изменения (нет новых endpoint'ов, контракты не трогаем)
- Аналитика clicks (Umami остаётся как есть)
- Yandex OAuth flow refactor
- PWA push notifications, service-worker upgrade
- A/B testing инфра (нет фичефлагов)
- Storybook (есть отдельный план)
- Accessibility audit deep-dive (поверхностный — да: focus-ring под
  новый accent, AA контрасты в палитре)

---

## 8. Decision log

| # | Решение | Дефолт был | Юзер выбрал | Reasoning |
|---|---|---|---|---|
| 1 | `/` landing vs map-as-home | оставить map-as-home | landing на `/`, карта на `/map` | дизайн `D1VLanding` подразумевает hero-first IA; user explicitly chose «как можно ближе к дизайну» |
| 2 | Map full-bleed vs sidebar grid | оставить sidebar | full-bleed + 3 floating cards | дизайн `D1VMap` показывает full-bleed; user chose «как можно ближе» |
| 3 | Onboarding 3-step | отложить (Phase 4) | сделать сразу | user explicit «делать!»; mobile already имеет screen — sync с web имеет смысл |
| 4 | Mobile native sync | сначала web | синхронно, одной волной | `feedback_keep_envs_in_sync.md` правило — не оставлять рассинхрон prod-DB vs prod-tile vs mobile |
| 5 | Basemap colors | accept as-is | accept as-is, Phase 7 — позже если будет gap | custom MapLibre paint patches — отдельная большая работа; floating cards уже сильно меняют восприятие |
| 6 | Caveat handwritten | selectively | да, selectively (forecast accent, hero, onboarding) | overuse rant сделает дизайн перегруженным; используем как акцент |
| 7 | Calendar route | отложить | сделать сразу | user explicit «как можно ближе» — calendar в дизайне отдельная страница |
| 8 | Brand guide MDX | да | да | естественное место в IA — methodology уже есть |
| 9 | Pre-prod visual verification | (не было) | добавить Phase V | user explicit запрос «через хром браузер... покликать на все кнопки» |
| 10 | Adversarial review pass | (не было) | done | user explicit запрос «проверь сам через скиллы»; нашли 5 critical, фиксы применены в W0 + Phase V + conventions |

---

## 9. Что дальше

После approval этого spec — переход в **writing-plans**: детальный
implementation plan с TDD-подходом по каждой фазе, breakdown задач,
acceptance criteria per-task, конкретные команды для validation.
Реализация — отдельная сессия с `/loop` или executing-plans.
