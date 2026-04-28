/**
 * Карта маршрутов сайта. Один источник правды.
 *
 * /             - Главная с hero и входом в карту
 * /map          - Полноэкранная карта (lazy — MapLibre тяжёлый, не
 *                 грузим на других страницах; см. MapPage.tsx)
 * /species      - Каталог видов (placeholder на Фазе 1)
 * /guide        - Полевые гайды (placeholder)
 * /methodology  - Методология данных
 * /about        - Об авторе
 * /auth/*       - OAuth-flow (Yandex ID)
 * /cabinet      - Личный кабинет (за ProtectedRoute)
 * /legal/*      - Privacy / Terms (drafts)
 * *             - 404
 */
import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";

import { Layout } from "./components/layout/Layout";
import { HomePage } from "./routes/HomePage";
import { MapHomePage } from "./routes/MapHomePage";
import { AboutPage } from "./routes/AboutPage";
import { NotFoundPage } from "./routes/NotFoundPage";
import { MethodologyPage } from "./routes/MethodologyPage";
import { MethodologyArticlePage } from "./routes/MethodologyArticlePage";
import { SpeciesListPage } from "./routes/SpeciesListPage";
import { SpeciesDetailPage } from "./routes/SpeciesDetailPage";
import { AuthPage } from "./routes/AuthPage";
import { AuthCompletePage } from "./routes/AuthCompletePage";
import { AuthErrorPage } from "./routes/AuthErrorPage";
import { CabinetPage } from "./routes/CabinetPage";
import { CabinetSpotsPage } from "./routes/CabinetSpotsPage";
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
      // Главная — теперь карта-обзор с sidebar'ом (variant C редизайна).
      // Старая `HomePage` (hero + виджеты) больше не на `/`; компонент
      // оставлен в коде для возможного восстановления и будет удалён в
      // фазе 2.5 cleanup. См. docs/redesign-2026-04.md.
      { index: true, element: <MapHomePage /> },
      // /map → 301-style redirect на главную (главная и есть карта).
      { path: "map", element: <Navigate to="/" replace /> },
      // /map/:district — детальный режим района (slug = osm_rel_id или
      // транслит). Phase 2.X partial: пока подсасываем тот же MapPage,
      // SidebarDistrict пока пустой. Phase 2.Y допишет его.
      {
        path: "map/:district",
        element: (
          <Suspense fallback={<MapPageLoader />}>
            <MapPage />
          </Suspense>
        ),
      },
      // /forecast — старый плейсхолдер, теперь главная и есть прогноз.
      { path: "forecast", element: <Navigate to="/" replace /> },
      // /guide — старый плейсхолдер для гайдов; контент уехал в /methodology.
      { path: "guide", element: <Navigate to="/methodology" replace /> },
      // /home — временный путь к старому HomePage, на случай если нужно
      // быстро откатиться визуально без revert-коммита (фаза 2 страховка).
      { path: "home-legacy", element: <HomePage /> },
      { path: "species",        element: <SpeciesListPage /> },
      { path: "species/:slug",  element: <SpeciesDetailPage /> },
      { path: "methodology",         element: <MethodologyPage /> },
      { path: "methodology/:slug",    element: <MethodologyArticlePage /> },
      // /about → /methodology/about (контент в content/methodology/about.mdx
      // с фазы 1 routine commit). Старый AboutPage остаётся для phase-2.5
      // удаления.
      { path: "about",         element: <Navigate to="/methodology/about" replace /> },
      { path: "about-legacy",  element: <AboutPage /> },

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
