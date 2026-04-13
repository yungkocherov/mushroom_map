import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// В proxy target'е обязательно используем IPv4 loopback напрямую.
// На Windows node 18+ резолвит "localhost" в ::1 (IPv6) первым, а docker-desktop
// публикует порт на IPv4 (127.0.0.1). В итоге http-proxy ловит ECONNREFUSED
// и отвечает 500/502 вместо того чтобы пробросить PMTiles range-запрос.
const API_TARGET = process.env.VITE_API_URL ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
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
