/**
 * Карта маршрутов сайта. Один источник правды.
 *
 * Phase W2 (redesign-2026-05): инверсия `/` ↔ `/map`. Лендинг теперь
 * приветствует на `/`, карта переезжает на `/map`. Добавлены
 * `/calendar` и `/onboarding`.
 *
 * /             - Landing (hero + map cameo) [redesign-2026-05]
 * /map          - Полноэкранная карта (бывший `/`)
 * /map/:district - Detail режим района
 * /calendar     - Сезонный календарь видов
 * /onboarding   - 3-step wizard (first-visit redirect)
 * /species      - Каталог видов
 * /spots        - Сохранённые места (auth-gated)
 * /methodology  - Методология данных
 * /about        - 301 → /methodology
 * /auth/*       - OAuth-flow (Yandex ID)
 * /cabinet      - Личный кабинет (за ProtectedRoute)
 * /legal/*      - Privacy / Terms (drafts)
 * *             - 404
 */
import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";

import { Layout } from "./components/layout/Layout";
import { LandingPage } from "./routes/LandingPage";
import { MapHomePage } from "./routes/MapHomePage";
import { CalendarPage } from "./routes/CalendarPage";
import { OnboardingPage } from "./routes/OnboardingPage";
import { NotFoundPage } from "./routes/NotFoundPage";
import { MethodologyPage } from "./routes/MethodologyPage";
import { SpeciesListPage } from "./routes/SpeciesListPage";
import { SpeciesDetailPage } from "./routes/SpeciesDetailPage";
import { AuthPage } from "./routes/AuthPage";
import { AuthCompletePage } from "./routes/AuthCompletePage";
import { AuthErrorPage } from "./routes/AuthErrorPage";
import { CabinetPage } from "./routes/CabinetPage";
import { CabinetSpotsPage } from "./routes/CabinetSpotsPage";
import { SpotDetailPage } from "./routes/SpotDetailPage";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { PrivacyPage } from "./routes/legal/PrivacyPage";
import { TermsPage } from "./routes/legal/TermsPage";

// MapPage и MapHomePage тянут MapLibre GL + PMTiles (~600–700 КБ
// минифицированных JS). Lazy-load срезает main-bundle на все не-карта
// страницы: /species, /about и т. д. — а главная неизбежно несёт этот
// груз, потому что карта = главная (variant C редизайна).
const MapPage = lazy(() =>
  import("./routes/MapPage").then((m) => ({ default: m.MapPage })),
);

function MapPageLoader() {
  return (
    <div
      role="status"
      aria-label="Загружаем карту"
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "var(--paper)",
        color: "var(--ink-dim)",
        fontSize: "var(--fs-sm)",
      }}
    >
      Загружаем карту…
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      // Phase W2 (redesign-2026-05): `/` теперь Landing, карта переехала
      // на `/map`. Phase W3 заполнит Landing полным D1VLanding port'ом.
      { index: true, element: <LandingPage /> },
      // Карта — теперь на `/map`. Sidebar grid доживает до Phase W4
      // (full-bleed + floating panels rewrite).
      { path: "map", element: <MapHomePage /> },
      // /map/:district — детальный режим района (slug = osm_rel_id или
      // транслит). До Phase W4 подсасывает MapPage; W4 reconcile'ит с
      // MapHomePage + DistrictDetailPanel.
      {
        path: "map/:district",
        element: (
          <Suspense fallback={<MapPageLoader />}>
            <MapPage />
          </Suspense>
        ),
      },
      // Новые routes Phase W2 — placeholder'ы, наполняются в W3 / W5.
      { path: "calendar",   element: <CalendarPage /> },
      { path: "onboarding", element: <OnboardingPage /> },
      // /forecast — старый плейсхолдер, теперь главная и есть прогноз.
      { path: "forecast", element: <Navigate to="/" replace /> },
      // /guide — старый плейсхолдер для гайдов; контент уехал в /methodology.
      { path: "guide", element: <Navigate to="/methodology" replace /> },
      // /home-legacy и /about-legacy удалены: главная неделю катается на
      // MapHomePage без откатов, контент About переехал в MDX. Если когда-то
      // понадобится откат — `git revert` PR'а phase 2.f.
      { path: "home-legacy", element: <Navigate to="/map" replace /> },
      { path: "species",        element: <SpeciesListPage /> },
      { path: "species/:slug",  element: <SpeciesDetailPage /> },
      { path: "methodology",         element: <MethodologyPage /> },
      // Статьи методологии скрыты — раздел переписывается. Все
      // /methodology/:slug ведут на placeholder hub.
      { path: "methodology/:slug",    element: <Navigate to="/methodology" replace /> },
      { path: "about",         element: <Navigate to="/methodology" replace /> },
      { path: "about-legacy",  element: <Navigate to="/methodology" replace /> },

      // Auth flow: /auth (login) -> Yandex -> /api/auth/yandex/callback
      // (backend, устанавливает cookie) -> /auth/complete (hydrate) ->
      // /cabinet. Ошибки OAuth приземляются на /auth/error.
      { path: "auth",           element: <AuthPage /> },
      { path: "auth/complete",  element: <AuthCompletePage /> },
      { path: "auth/error",     element: <AuthErrorPage /> },
      {
        path: "cabinet",
        element: (
          <ProtectedRoute>
            <CabinetPage />
          </ProtectedRoute>
        ),
      },
      // Каноничный URL — /spots (по spec'у redesign-2026-04). Старые
      // /cabinet/spots оставлены 301'ом для внешних ссылок и кэша.
      {
        path: "spots",
        element: (
          <ProtectedRoute>
            <CabinetSpotsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "spots/:id",
        element: (
          <ProtectedRoute>
            <SpotDetailPage />
          </ProtectedRoute>
        ),
      },
      { path: "cabinet/spots", element: <Navigate to="/spots" replace /> },

      // Legal drafts — линкуется footer, AuthPage, MDX-методология.
      // /legal/privacy и /legal/terms → новые URL под /methodology/{privacy,terms}.
      // Старые /legal/* пути остаются для не-редиректящих гипер-ссылок
      // в существующих внешних местах (соцсети, Yandex Cloud OAuth).
      // TODO(phase-2.5): полностью переехать на /methodology/* и
      // вернуть /legal/* как 301.
      { path: "legal/privacy", element: <PrivacyPage /> },
      { path: "legal/terms",   element: <TermsPage /> },

      { path: "*",     element: <NotFoundPage /> },
    ],
  },
]);
