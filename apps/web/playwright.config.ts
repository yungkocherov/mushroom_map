/**
 * Playwright config — Phase 3.
 *
 * Тесты живут в `apps/web/tests/`. Запуск через `npx playwright test`
 * из этого пакета (или `npm test:e2e` с репо-root, если будет добавлен
 * скрипт). baseURL = vite dev (5173).
 *
 * webServer: Playwright сам поднимает `npm run dev` и ждёт http-200 на
 * baseURL. Если сервер уже запущен (открыт локально) — переиспользует
 * (`reuseExistingServer: true`). API ожидаем поднятым отдельно
 * (`docker compose up db api`); тесты, требующие forecast, помечаются
 * `test.describe.skip`'ом до момента, когда CI-flow заведётся.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    headless: true,
    trace: "on-first-retry",
  },

  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: true,
        timeout: 60_000,
      },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
