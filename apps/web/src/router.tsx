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
import { createBrowserRouter, Navigate } from "react-router-dom";

import { Layout } from "./components/layout/Layout";
import { HomePage } from "./routes/HomePage";
import { MapPage } from "./routes/MapPage";
import { AboutPage } from "./routes/AboutPage";
import { PlaceholderPage } from "./routes/PlaceholderPage";

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
      {
        path: "methodology",
        element: (
          <PlaceholderPage
            title="Методология"
            description="Источники данных (Рослесхоз, OSM, Copernicus), способы обработки и известные ограничения."
          />
        ),
      },
      { path: "about", element: <AboutPage /> },
      { path: "*",     element: <Navigate to="/" replace /> },
    ],
  },
]);
