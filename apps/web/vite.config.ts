import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import mdx from "@mdx-js/rollup";
import { VitePWA } from "vite-plugin-pwa";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";

// В proxy target'е обязательно используем IPv4 loopback напрямую.
// На Windows node 18+ резолвит "localhost" в ::1 (IPv6) первым, а docker-desktop
// публикует порт на IPv4 (127.0.0.1). В итоге http-proxy ловит ECONNREFUSED
// и отвечает 500/502 вместо того чтобы пробросить PMTiles range-запрос.
const API_TARGET = process.env.VITE_API_URL ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [
    // MDX-плагин обязан идти до @vitejs/plugin-react, чтобы .mdx сначала
    // превратился в JSX, а потом был подхвачен React Fast Refresh'ем.
    { enforce: "pre", ...mdx({
      remarkPlugins: [remarkGfm],
      rehypePlugins: [
        rehypeSlug,
        [rehypeAutolinkHeadings, { behavior: "wrap" }],
      ],
    }) },
    react({ include: /\.(mdx|md|jsx|tsx|ts)$/ }),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Грибная карта Ленинградской области",
        short_name: "Грибная карта",
        description: "Интерактивная карта и прогноз плодоношения грибов в Ленобласти",
        lang: "ru",
        theme_color: "#2d5a3a",
        background_color: "#f5f1e6",
        display: "standalone",
        start_url: "/",
        scope: "/",
        categories: ["utilities", "education", "travel"],
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        navigateFallback: "/index.html",
        // PMTiles кэшировать не стоит (сотни МБ), API GET'ы — network-first
        // с коротким fallback'ом. Конкретные stale-while-revalidate политики
        // настроим точнее когда появятся /api/species/:slug + /api/stats/*.
        runtimeCaching: [
          {
            // Приватные эндпоинты (auth + user-owned data) НЕ кешируем
            // в SW: иначе следующий пользователь на устройстве, открыв
            // /spots до hydrate'а, увидит закешированные споты предыдущего.
            // Public read-эндпоинты (forest/at, species/list, ...) — кешируем
            // ниже под NetworkFirst.
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/api/") &&
              !url.pathname.startsWith("/api/auth/") &&
              !url.pathname.startsWith("/api/user/") &&
              !url.pathname.startsWith("/api/cabinet/") &&
              !url.pathname.startsWith("/api/mobile/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "mushroom-api",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,  // SW в dev обычно мешает — включим по необходимости
      },
    }),
  ],
  build: {
    // Self-hosted source maps для GlitchTip. Sentry SDK на проде
    // подтягивает .map по URL рядом с bundle'ом и резолвит stack-trace
    // в исходник. Минус: maps публично доступны (acceptable для
    // open-source). Альтернатива — @sentry/vite-plugin для аплоада в
    // GlitchTip; см. services/observability/README.md «Source maps
    // экспонированы».
    sourcemap: true,
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    watch: { usePolling: true, interval: 300 },
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
      },
      // PMTiles uses HTTP Range requests against a 54MB file.
      // http-proxy (node-http-proxy) needs explicit options so that
      // Range / If-Range headers и 206 Partial Content проходят без буферизации.
      "/tiles": {
        target: API_TARGET,
        changeOrigin: true,
        ws: false,
        selfHandleResponse: false,
        // Отключаем любые трансформации тела — это бинарный поток.
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            // Прокидываем Range-заголовок как есть (по умолчанию он и так идёт,
            // но некоторые промежуточные слои его срезают — фиксируем явно).
            const range = req.headers["range"];
            if (range) proxyReq.setHeader("range", range);
            const ifRange = req.headers["if-range"];
            if (ifRange) proxyReq.setHeader("if-range", ifRange);
            // Убираем accept-encoding, чтобы апстрим не включал gzip
            // (несовместимо с Range на бинарнике и ломает Content-Length).
            proxyReq.setHeader("accept-encoding", "identity");
          });
          proxy.on("proxyRes", (proxyRes) => {
            // Гарантируем, что клиент увидит, что сервер поддерживает диапазоны.
            if (!proxyRes.headers["accept-ranges"]) {
              proxyRes.headers["accept-ranges"] = "bytes";
            }
          });
          proxy.on("error", (err, _req, res) => {
            // Явно логируем ошибку прокси, чтобы не получать немой 500.
            // eslint-disable-next-line no-console
            console.error("[vite proxy /tiles] error:", err.message);
            if (res && "writeHead" in res && !res.headersSent) {
              res.writeHead(502, { "content-type": "text/plain" });
              res.end(`proxy error: ${err.message}`);
            }
          });
        },
      },
    },
  },
});
