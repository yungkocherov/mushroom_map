/**
 * Phase 2: главная страница (MapHomePage) рендерит SidebarOverview +
 * MapView. Тут проверяем минимум, не зависящий от живого API:
 *  - H1 sidebar'а монтируется
 *  - map-контейнер существует
 *
 * Eyebrow-тексты разные на разных вариантах (могут меняться) —
 * не проверяем чтобы не привязываться к конкретной фразе.
 */
import { test, expect } from "@playwright/test";

test("/ renders MapHomePage shell", async ({ page }) => {
  await page.goto("/");

  // H1 — стабильный якорь, sidebar его рендерит сразу
  await expect(
    page.getByRole("heading", { level: 1, name: /Ленинградская область/i }),
  ).toBeVisible();

  // DateScrubber — 7+ пилюль (button[aria-pressed])
  const pills = page.locator("button[aria-pressed]");
  await expect.poll(async () => await pills.count()).toBeGreaterThanOrEqual(7);

  // Map-контейнер (MapLibre монтируется в .map-root div)
  await expect(page.locator(".map-root")).toBeVisible();
});

test("Spotlight opens on Ctrl+K", async ({ page }) => {
  await page.goto("/");

  // Ждём H1, чтобы page точно был интерактивный
  await expect(
    page.getByRole("heading", { level: 1, name: /Ленинградская область/i }),
  ).toBeVisible();

  await page.keyboard.press("Control+K");

  // Radix Dialog labelledby → DialogTitle "Поиск по видам и местам",
  // не aria-label. Используем regex.
  const dialog = page.getByRole("dialog", { name: /Поиск/i });
  await expect(dialog).toBeVisible();

  // Esc закрывает
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
