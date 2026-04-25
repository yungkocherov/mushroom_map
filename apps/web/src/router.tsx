/**
 * Карта маршрутов сайта. Один источник правды.
 *
 * /             - Главная с hero и входом в карту
 * /map          - Полноэкранная карта (текущее приложение)
 * /species      - Каталог видов (placeholder на Фазе 1)
 * /guide        - Полевые гайды (placeholder)
 * /methodology  - Методология данных (placeholder)
 * /about        - Об авторе
 * *             - Любой несуществующий путь → редирект на /
 */
import { createBrowserRouter } from "react-router-dom";

import { Layout } from "./components/layout/Layout";
import { HomePage } from "./routes/HomePage";
import { MapPage } from "./routes/MapPage";
import { AboutPage } from "./routes/AboutPage";
import { PlaceholderPage } from "./routes/PlaceholderPage";
import { NotFoundPage } from "./routes/NotFoundPage";
import { MethodologyPage } from "./routes/MethodologyPage";
import { MethodologyArticlePage } from "./routes/MethodologyArticlePage";
import { AuthPage } from "./routes/AuthPage";
import { AuthCompletePage } from "./routes/AuthCompletePage";
import { AuthErrorPage } from "./routes/AuthErrorPage";
import { CabinetPage } from "./routes/CabinetPage";
import { ProtectedRoute } from "./auth/ProtectedRoute";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "map", element: <MapPage /> },
      {
        path: "species",
        element: (
          <PlaceholderPage
            title="Справочник видов"
            description="Подробные страницы по каждому грибу: съедобность, сезон, типы леса, двойники. Появится в следующей фазе."
          />
        ),
      },
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

      { path: "*",     element: <NotFoundPage /> },
    ],
  },
]);
