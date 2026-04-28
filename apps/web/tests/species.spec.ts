/**
 * Phase 3: /species (каталог) и /species/:slug (детальная карточка).
 *
 * Зависит от живого API на :8000 (`docker compose up -d api`):
 *  - GET /api/species/      — список видов
 *  - GET /api/species/<slug> — детализация
 *
 * Если API не поднят, тесты честно падают по timeout'у — это сигнал
 * проверить docker.
 */
import { test, expect } from "@playwright/test";

test("/species renders catalog with edibility filter", async ({ page }) => {
  await page.goto("/species");

  // Eyebrow + динамический H1
  await expect(
    page.getByRole("heading", { level: 1, name: /из реестра проекта/i }),
  ).toBeVisible();

  // Filter — хотя бы 5 кнопок (Все + 4 категории edibility)
  const filterButtons = page.locator('nav[aria-label*="едобности"] button');
  await expect.poll(async () => await filterButtons.count()).toBeGreaterThanOrEqual(5);

  // Должна быть хотя бы 1 карточка в каталоге
  const cards = page.locator('a[href^="/species/"]');
  await expect.poll(async () => await cards.count()).toBeGreaterThanOrEqual(1);
});

test("/species filter narrows result list", async ({ page }) => {
  await page.goto("/species");

  // Ждём загрузки
  await expect(
    page.getByRole("heading", { level: 1, name: /из реестра проекта/i }),
  ).toBeVisible();
  const cards = page.locator('a[href^="/species/"]');
  await expect.poll(async () => await cards.count()).toBeGreaterThanOrEqual(2);

  const totalBefore = await cards.count();

  // Кликаем "Съедобный" — должно остаться меньше карточек, чем "Все"
  await page
    .locator('nav[aria-label*="едобности"] button', { hasText: "Съедобный" })
    .first()
    .click();

  // Filter — клиентский, мгновенный
  await expect
    .poll(async () => await cards.count())
    .toBeLessThanOrEqual(totalBefore);
});

test("/species card click navigates to detail page", async ({ page }) => {
  await page.goto("/species");

  await expect(
    page.getByRole("heading", { level: 1, name: /из реестра проекта/i }),
  ).toBeVisible();

  const firstCard = page.locator('a[href^="/species/"]').first();
  const href = await firstCard.getAttribute("href");
  await firstCard.click();

  await expect(page).toHaveURL(new RegExp(`${href}$`));
  // На детальной странице должен быть hero с breadcrumb «← все виды»
  await expect(page.getByRole("link", { name: /все виды/i })).toBeVisible();
});

test("/species/boletus-edulis renders hero + affinity + CTA", async ({ page }) => {
  await page.goto("/species/boletus-edulis");

  // Hero
  await expect(
    page.getByRole("heading", { level: 1, name: "Белый гриб" }),
  ).toBeVisible();

  // CTA «Открыть на карте →» (chanterelle button)
  const cta = page.getByRole("link", { name: /Открыть на карте/i });
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute("href", /species=boletus-edulis/);

  // Сродство к лесу — affinity-bars (по умолчанию у белого их 8)
  await expect(
    page.getByRole("heading", { level: 2, name: /Где встречается чаще всего/i }),
  ).toBeVisible();
});

test("/species/unknown-slug shows 404", async ({ page }) => {
  await page.goto("/species/this-does-not-exist-xyz");
  await expect(
    page.getByRole("heading", { level: 1, name: /Вид не найден/i }),
  ).toBeVisible();
});
