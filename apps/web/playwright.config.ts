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
  // Serial-режим. Vite cold-start (компиляция + MDX glob) занимает 5–15 сек
  // на холодную; 11 тестов в параллель толкаются друг с другом за тот же
  // dev-server и истекают по timeout'у. Серийно с длинными лимитами —
  // прогон занимает ~30 сек, но проходит стабильно.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  // Дефолтный test-timeout 30s; Vite cold-start + большой бандл иногда
  // на 1-й странице ломится в 10+ сек.
  timeout: 60_000,

  expect: {
    // Дефолт expect.toHaveURL ждёт 5 сек. На холодном vite этого мало.
    timeout: 15_000,
  },

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    headless: true,
    trace: "on-first-retry",
    // Дефолт `page.click` / `getByRole().click()` тоже 5 сек.
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
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
