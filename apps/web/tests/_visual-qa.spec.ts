/**
 * Visual QA helper — НЕ полноценный регресс-тест. Делает скриншоты
 * ключевых страниц для ручного просмотра. Запуск отдельным проектом
 * `--grep visual-qa` или `npx playwright test _visual-qa`.
 *
 * Скриншоты складываются в `apps/web/test-results/qa/`.
 */
import { test, expect } from "@playwright/test";

test.describe("visual-qa", () => {
  test("home overview", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: /Где сегодня грибы/i }),
    ).toBeVisible();
    await page.waitForTimeout(1500); // дать MapLibre дорисоваться
    await page.screenshot({
      path: "test-results/qa/home-overview.png",
      fullPage: false,
    });
  });

  test("methodology hub", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1200 });
    await page.goto("/methodology");
    await expect(
      page.getByRole("heading", { level: 1, name: "Методология проекта" }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/qa/methodology-hub.png",
      fullPage: true,
    });
  });

  test("methodology article", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/methodology/about");
    await expect(
      page.getByRole("heading", { level: 1, name: "О проекте" }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/qa/methodology-article.png",
      fullPage: false,
    });
  });

  test("species list", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1200 });
    await page.goto("/species");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "test-results/qa/species-list.png",
      fullPage: true,
    });
  });

  test("species detail (boletus-edulis)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1200 });
    await page.goto("/species/boletus-edulis");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "test-results/qa/species-detail.png",
      fullPage: true,
    });
  });

  test("spotlight open", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: /Где сегодня грибы/i }),
    ).toBeVisible();
    await page.keyboard.press("Control+K");
    await expect(
      page.getByRole("dialog", { name: /Поиск/i }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/qa/spotlight.png",
      fullPage: false,
    });
  });

  test("spots (unauth)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/spots");
    await page.waitForLoadState("domcontentloaded");
    // Без auth ProtectedRoute редиректит на /auth — тоже screenshot'им
    await page.waitForTimeout(500);
    await page.screenshot({
      path: "test-results/qa/spots-unauth.png",
      fullPage: false,
    });
  });
});
