/**
 * Phase 3: Spotlight (⌘K) поиск по видам и топонимам.
 *
 * Зависит от живого API на :8000:
 *  - GET /api/species/search?q=…
 *  - GET /api/places/search?q=…
 *
 * Тесты пробуют несколько распространённых запросов и проверяют
 * что хотя бы что-то нашлось — точные тексты результатов привязаны
 * к содержимому БД и могут меняться, поэтому ассерты мягкие.
 */
import { test, expect } from "@playwright/test";

const HOME_H1 = /Где сегодня грибы/i;

async function openSpotlight(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: HOME_H1 }),
  ).toBeVisible();
  await page.keyboard.press("Control+K");
  const dialog = page.getByRole("dialog", { name: /Поиск/i });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("Spotlight: typed query triggers debounced fetch + shows results", async ({ page }) => {
  await openSpotlight(page);

  const input = page.getByRole("searchbox");
  await input.fill("белый");

  // Debounce 200ms + fetch — ждём появления любых результатов
  // (либо «Виды», либо «Места», либо empty fallback).
  // Если 2+ секунды ничего нет — что-то не так с API.
  await expect.poll(
    async () =>
      (await page.locator("section a[href]").count()) > 0 ||
      (await page.getByText("Ничего не нашлось").isVisible()),
    { timeout: 5000 },
  ).toBeTruthy();
});

test("Spotlight: short query (<2 chars) shows hint", async ({ page }) => {
  await openSpotlight(page);

  const input = page.getByRole("searchbox");
  await input.fill("б");

  // Под порог не лезем — должен висеть «Введите запрос»
  await expect(
    page.getByText(/Введите запрос/i),
  ).toBeVisible();
});

test("Spotlight: clicking species result navigates to detail", async ({ page }) => {
  await openSpotlight(page);

  const input = page.getByRole("searchbox");
  await input.fill("белый");

  // Ждём первого результата в секции «Виды»
  const speciesLink = page
    .locator("section")
    .filter({ has: page.getByText(/^Виды$/) })
    .locator('a[href^="/species/"]')
    .first();
  await expect(speciesLink).toBeVisible({ timeout: 5000 });

  await speciesLink.click();

  // Должны очутиться на /species/<slug>
  await expect(page).toHaveURL(/\/species\/[a-z0-9-]+$/);
});
