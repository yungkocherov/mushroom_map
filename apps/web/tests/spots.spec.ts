/**
 * Phase 3: /spots — приватный список + детальная страница спота.
 *
 * Без auth-fixture'а полноценный CRUD-тест не написать — но
 * auth-gate сам по себе важен, проверяем его.
 *
 * Для CRUD — отдельный test_cabinet_crud.py на бэке (он уже есть)
 * + ручной QA.
 */
import { test, expect } from "@playwright/test";

test("/spots без auth — редирект на /auth?next=/spots", async ({ page }) => {
  await page.goto("/spots");
  await page.waitForLoadState("domcontentloaded");
  await expect(page).toHaveURL(/\/auth\?next=/);
  await expect(
    page.getByRole("heading", { level: 1, name: /Вход/i }),
  ).toBeVisible();
});

test("/spots/some-id без auth — тот же auth-gate", async ({ page }) => {
  await page.goto("/spots/00000000-0000-0000-0000-000000000000");
  await page.waitForLoadState("domcontentloaded");
  await expect(page).toHaveURL(/\/auth\?next=/);
});
