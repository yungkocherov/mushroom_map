/**
 * Phase 3: visual regression.
 *
 * Скриншоты ключевых контентных страниц в desktop (1280×800) и mobile
 * (iPhone 13, 390×844). Карта (`/`) не покрыта — MapLibre canvas
 * нестабилен пиксель-в-пиксель между запусками (антиалиасинг + асинхронный
 * tile-load).
 *
 * Baseline хранится в `tests/visual.spec.ts-snapshots/` (per-platform).
 * Первый прогон создаёт snapshot, последующие сравнивают с
 * `maxDiffPixelRatio: 0.02` (допуск 2% — для шрифт-рендеринга на разных
 * хостах). Если spec падает с "no snapshot" → запусти один раз
 * `npx playwright test visual.spec.ts --update-snapshots`.
 *
 * CI-режим выключается через PLAYWRIGHT_SKIP_VISUAL=1 — снапшоты
 * платформо-зависимы; пока baseline собирается только на Windows-dev.
 */
import { test, expect } from "@playwright/test";

test.skip(
  !!process.env.PLAYWRIGHT_SKIP_VISUAL,
  "PLAYWRIGHT_SKIP_VISUAL=1 — visual regression выключена в этом ране",
);

const PAGES: Array<{ name: string; path: string; waitFor: string }> = [
  { name: "species-list", path: "/species", waitFor: 'a[href^="/species/"]' },
  { name: "species-detail", path: "/species/boletus-edulis", waitFor: "h1" },
  { name: "methodology-hub", path: "/methodology", waitFor: "h1" },
  {
    name: "methodology-article",
    path: "/methodology/about",
    waitFor: "h1",
  },
];

test.describe("desktop (1280×800)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const p of PAGES) {
    test(`${p.name} — снимок совпадает с baseline`, async ({ page }) => {
      await page.goto(p.path);
      await page.locator(p.waitFor).first().waitFor({ state: "visible" });
      // Дополнительная пауза на анимации появления (sidebar slide-in,
      // MDX-styled prose). Без неё на холодный vite snapshot мерцает.
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot(`${p.name}-desktop.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.02,
        animations: "disabled",
      });
    });
  }
});

test.describe("mobile (390×844, iPhone 13 viewport)", () => {
  // devices["iPhone 13"] меняет defaultBrowserType (webkit) — Playwright
  // запрещает это менять внутри describe. Берём только viewport + DPR.
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  for (const p of PAGES) {
    test(`${p.name} — снимок совпадает с baseline`, async ({ page }) => {
      await page.goto(p.path);
      await page.locator(p.waitFor).first().waitFor({ state: "visible" });
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot(`${p.name}-mobile.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.02,
        animations: "disabled",
      });
    });
  }
});
