import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { router } from "./router";
import { AuthProvider } from "./auth/AuthProvider";
import "@mushroom-map/tokens/tokens.css";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles/global.css";

// GlitchTip / Sentry init. Если DSN не задан в build-env — SDK no-op.
// Это значит код можно деплоить до того как поднят GlitchTip; активация
// — следующим релизом фронта после установки VITE_SENTRY_DSN в GH vars.
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const GIT_SHA = import.meta.env.VITE_GIT_SHA ?? "unknown";
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    release: GIT_SHA,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    // Не собирать содержимое форм/ошибок — могут быть координаты spot'а
    // или текст поиска. См. spec §5: privacy-first.
    sendDefaultPii: false,
  });
}

// Umami self-hosted analytics. Скрипт грузится отдельно (async/defer)
// чтобы не блокировать render. window.umami появляется после загрузки;
// `track()` в lib/track.ts умеет no-op если ещё не загрузился.
const UMAMI_HOST = import.meta.env.VITE_UMAMI_HOST;
const UMAMI_WEBSITE_ID = import.meta.env.VITE_UMAMI_WEBSITE_ID;
if (UMAMI_HOST && UMAMI_WEBSITE_ID) {
  const s = document.createElement("script");
  s.async = true;
  s.defer = true;
  s.src = `${UMAMI_HOST.replace(/\/$/, "")}/script.js`;
  s.setAttribute("data-website-id", UMAMI_WEBSITE_ID);
  document.head.appendChild(s);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </React.StrictMode>,
);
