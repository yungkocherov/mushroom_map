/**
 * Phase 2/3: проверка 301-перенаправлений старых URL'ов на новые места.
 *
 * Эти редиректы — клиентские (react-router `<Navigate replace>`), не
 * серверные. Поэтому вместо `expect(response.status() === 301)` смотрим
 * на финальный URL после загрузки страницы.
 *
 * Не зависит от API — все цели в роутере и отрабатывают синхронно.
 */
import { test, expect } from "@playwright/test";

const REDIRECTS: Array<[from: string, toPattern: RegExp]> = [
  ["/map", /\/$/],
  ["/forecast", /\/$/],
  ["/about", /\/methodology\/about$/],
  ["/about-legacy", /\/methodology\/about$/],
  ["/home-legacy", /\/$/],
  ["/guide", /\/methodology$/],
  ["/cabinet/spots", /\/spots$/],
];

for (const [from, toPattern] of REDIRECTS) {
  test(`${from} redirects to ${toPattern}`, async ({ page }) => {
    await page.goto(from);
    // react-router Navigate срабатывает уже после первого рендера —
    // ждём DOMContentLoaded + один micro-tick.
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(toPattern);
  });
}
