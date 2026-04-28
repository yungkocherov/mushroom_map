/**
 * Phase 3: /methodology хаб — 4 рубрики на сетке + статья по slug'у.
 * Чистый клиентский рендеринг (MDX через @mdx-js/rollup, eager glob).
 * API не нужен.
 */
import { test, expect } from "@playwright/test";

test("/methodology renders all 4 categories", async ({ page }) => {
  await page.goto("/methodology");

  // H1 — стабильный якорь
  await expect(
    page.getByRole("heading", { level: 1, name: "Методология проекта" }),
  ).toBeVisible();

  // 4 секции
  for (const cat of [
    "Источники данных",
    "Модель прогноза",
    "О проекте",
    "Юридическое",
  ]) {
    await expect(
      page.getByRole("heading", { level: 2, name: new RegExp(`^${cat}`) }),
    ).toBeVisible();
  }

  // «Модель прогноза» содержит бейдж «в работе»
  const modelHeading = page.getByRole("heading", {
    level: 2,
    name: /Модель прогноза/,
  });
  await expect(modelHeading).toContainText("в работе");
});

test("/methodology/about renders the about article", async ({ page }) => {
  await page.goto("/methodology/about");

  await expect(
    page.getByRole("heading", { level: 1, name: "О проекте" }),
  ).toBeVisible();
});

test("/methodology hub links to source articles", async ({ page }) => {
  await page.goto("/methodology");

  await page.getByRole("link", { name: /Лесные данные/ }).click();
  await expect(page).toHaveURL(/\/methodology\/forest-data$/);
  await expect(
    page.getByRole("heading", { level: 1, name: /Лесные данные/ }),
  ).toBeVisible();
});
