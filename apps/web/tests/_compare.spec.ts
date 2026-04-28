/**
 * Одноразовый снимок главной (`/`) для сравнения с brainstorm-мокапом
 * `.superpowers/brainstorm/6735-1777312627/content/hero-c-fullsize.html`.
 * Не используется в обычном прогоне — скрин сохраняется руками после
 * `npx playwright test _compare.spec.ts`.
 */
import { test } from "@playwright/test";

test.describe("compare", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("snapshot / for visual comparison", async ({ page }) => {
    await page.goto("/");
    // Дать карте время отрисоваться (PMTiles + раскрашивание).
    // Ждём, пока MapLibre дорисует канвас и forecast-choropleth отрисуется.
    await page.waitForFunction(() => {
      const c = document.querySelector("canvas.maplibregl-canvas") as HTMLCanvasElement | null;
      return !!c && c.width > 0;
    }, { timeout: 15000 });
    await page.waitForTimeout(4000);
    await page.screenshot({
      path: "test-results/_current-home-desktop.png",
      fullPage: false,
    });
  });

  test("snapshot /species/boletus-edulis for comparison", async ({ page }) => {
    await page.goto("/species/boletus-edulis");
    await page.locator("h1").first().waitFor({ state: "visible" });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: "test-results/_current-species-detail-desktop.png",
      fullPage: true,
    });
  });

  test("snapshot /methodology for comparison", async ({ page }) => {
    await page.goto("/methodology");
    await page.locator("h1").first().waitFor({ state: "visible" });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: "test-results/_current-methodology-desktop.png",
      fullPage: true,
    });
  });
});
