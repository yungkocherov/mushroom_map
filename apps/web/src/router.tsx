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
import { createBrowserRouter } from "react-router-dom";

import { Layout } from "./components/layout/Layout";
import { HomePage } from "./routes/HomePage";
import { AboutPage } from "./routes/AboutPage";
import { PlaceholderPage } from "./routes/PlaceholderPage";
import { NotFoundPage } from "./routes/NotFoundPage";
import { MethodologyPage } from "./routes/MethodologyPage";
import { MethodologyArticlePage } from "./routes/MethodologyArticlePage";
import { SpeciesListPage } from "./routes/SpeciesListPage";
import { AuthPage } from "./routes/AuthPage";
import { AuthCompletePage } from "./routes/AuthCompletePage";
import { AuthErrorPage } from "./routes/AuthErrorPage";
import { CabinetPage } from "./routes/CabinetPage";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { PrivacyPage } from "./routes/legal/PrivacyPage";
import { TermsPage } from "./routes/legal/TermsPage";

// MapPage тянет за собой MapLibre GL + PMTiles (~600–700 КБ минифицированных
// JS). Lazy-load срезает main-bundle на все не-карта страницы: /, /species,
// /about и т. д. загружаются без MapLibre.
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
      { index: true, element: <HomePage /> },
      {
        path: "map",
        element: (
          <Suspense fallback={<MapPageLoader />}>
            <MapPage />
          </Suspense>
        ),
      },
      { path: "species", element: <SpeciesListPage /> },
      {
        path: "guide",
        element: (
          <PlaceholderPage
            title="Полевые гайды"
            description="Сезоны, безопасность, правовые вопросы сбора, снаряжение. Раздел готовится."
          />
        ),
      },
      { path: "methodology",         element: <MethodologyPage /> },
      { path: "methodology/:slug",    element: <MethodologyArticlePage /> },
      { path: "about", element: <AboutPage /> },

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

      // Legal drafts — на них линкуется footer, AuthPage и MDX-методология.
      { path: "legal/privacy", element: <PrivacyPage /> },
      { path: "legal/terms",   element: <TermsPage /> },

      { path: "*",     element: <NotFoundPage /> },
    ],
  },
]);
