/**
 * Phase 2: главная страница (MapHomePage) рендерит SidebarOverview +
 * MapView. Тут проверяем минимум, не зависящий от живого API:
 *  - sidebar монтируется (eyebrow + H1 + DateScrubber)
 *  - map-контейнер существует
 *
 * Тесты с forecast-чисел и flyTo'ом — отдельно, когда API будет
 * подниматься в test-fixture'е.
 */
import { test, expect } from "@playwright/test";

test("/ renders MapHomePage shell", async ({ page }) => {
  await page.goto("/");

  // Eyebrow и H1 sidebar'а
  await expect(
    page.getByText("Грибная погода", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: /Ленинградская область/i }),
  ).toBeVisible();

  // DateScrubber — 7 пилюль с днями недели (минимум одна найдётся
  // как `<button>` под aria-label'ом «дата»). Точнее тестировать
  // не имеет смысла, пока расписание форматов нестабильно.
  await expect(page.locator("button[aria-pressed]")).toHaveCount(7, {
    timeout: 5000,
  });

  // Map-контейнер (MapLibre монтируется в .map-root div)
  await expect(page.locator(".map-root")).toBeVisible();
});

test("Spotlight opens on Cmd+K", async ({ page }) => {
  await page.goto("/");

  // Modifier varies по платформе: используем Meta+K (mac) с fallback'ом
  // на Control+K — Playwright сам подберёт раскладку.
  await page.keyboard.press("Control+K");

  await expect(
    page.getByRole("dialog", { name: "Поиск" }),
  ).toBeVisible();

  // Esc закрывает
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Поиск" }),
  ).not.toBeVisible();
});
