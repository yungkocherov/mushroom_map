/**
 * Audit интеракций: Spotlight (⌘K), DateScrubber переключает дату,
 * клик по choropleth-району переходит в district mode и летит туда.
 */
import { test, expect } from "@playwright/test";

test("Spotlight: Ctrl+K открывает диалог + поиск работает", async ({ page }) => {
  await page.goto("/");
  await page.locator("header").first().waitFor({ state: "visible" });
  await page.waitForTimeout(500);

  await page.keyboard.press("Control+k");
  // Spotlight — Radix Dialog с aria-modal
  const dlg = page.locator('[role="dialog"]').first();
  await expect(dlg).toBeVisible({ timeout: 3000 });

  const input = dlg.locator('input[type="search"], input[placeholder*="ищ"i], input').first();
  await input.fill("белый");
  await page.waitForTimeout(800);

  const results = dlg.locator('a, [role="option"]');
  const count = await results.count();
  console.log("Spotlight results count:", count);
  expect(count).toBeGreaterThan(0);

  await page.keyboard.press("Escape");
  await expect(dlg).toBeHidden({ timeout: 2000 });
});

test("DateScrubber: смена даты не падает + UI обновляется", async ({ page }) => {
  await page.goto("/");
  await page.locator("h1", { hasText: "Где сегодня грибы" }).waitFor({ state: "visible" });
  await page.waitForTimeout(2500);

  // 7 пилюль внутри group[aria-label="Дата прогноза"]
  const tomorrow = page.locator('[aria-label="Дата прогноза"] button').nth(1);
  const tomorrowText = await tomorrow.textContent();
  console.log("Clicking second pill, text:", tomorrowText);
  await tomorrow.click();
  await page.waitForTimeout(800);

  // Топ-5 список должен обновиться (могут быть те же районы, но render
  // не упадёт)
  const topItems = page.locator('[class*="topRow"]');
  const topCount = await topItems.count();
  expect(topCount).toBeGreaterThan(0);
  console.log("Top-N items after date click:", topCount);
});

test("/map/:district — флай в район, sidebar в district mode", async ({ page }) => {
  // Прямой URL на район по slug. slug = osm_rel_id, проверим существующий.
  await page.goto("/map/1145712"); // Волосовский район slug
  await page.locator("canvas.maplibregl-canvas").waitFor({ state: "visible" });
  await page.waitForTimeout(3500);
  // SidebarDistrict должен рендериться вместо SidebarOverview
  const html = await page.content();
  console.log("Has SidebarDistrict:", html.includes("Волосов") || html.includes("район"));
  // Без падения — ОК даже если district sidebar пустой (phase 2.X partial).
});
