/**
 * Глубокая инспекция / на десктопе. Снимает скрин, дампит DOM-структуру
 * (header / sidebar / map controls / spotlight присутствие), считает
 * console-error'ы, проверяет реальный фон body (light vs dark theme).
 */
import { test } from "@playwright/test";

test("inspect / deeply", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console.error: " + m.text());
  });

  await page.goto("/");
  await page.waitForFunction(() => {
    const c = document.querySelector("canvas.maplibregl-canvas") as HTMLCanvasElement | null;
    return !!c && c.width > 0;
  }, { timeout: 15000 });
  await page.waitForTimeout(3000);

  const facts = await page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    const cs = getComputedStyle(html);
    return {
      dataTheme: html.getAttribute("data-theme"),
      htmlBgPaper: cs.getPropertyValue("--paper").trim(),
      htmlBgInk: cs.getPropertyValue("--ink").trim(),
      bodyBg: getComputedStyle(body).backgroundColor,
      hasHeader: !!document.querySelector("header"),
      headerText: document.querySelector("header")?.textContent?.slice(0, 200) ?? null,
      hasFooter: !!document.querySelector("footer"),
      hasMapControls: !!document.querySelector("[class*='controls']"),
      hasSearchBar: !!document.querySelector("input[type='search'], [class*='searchBar']"),
      hasSidebar: !!document.querySelector("aside"),
      hasSpotlightMounted: !!document.querySelector("[role='dialog'][aria-label*='Spotlight'i]") || !!document.querySelector("[class*='spotlight'i]"),
      h1Text: document.querySelector("h1")?.textContent ?? null,
      h1FontFamily: document.querySelector("h1") ? getComputedStyle(document.querySelector("h1")!).fontFamily : null,
      forecastFillExists: !!document.querySelector("canvas.maplibregl-canvas"),
      navLinks: Array.from(document.querySelectorAll("header a, nav a")).map((a) => ({
        text: (a as HTMLAnchorElement).textContent?.trim(),
        href: (a as HTMLAnchorElement).getAttribute("href"),
      })),
    };
  });

  console.log("FACTS:", JSON.stringify(facts, null, 2));
  console.log("ERRORS:", JSON.stringify(errors, null, 2));

  await page.screenshot({
    path: "test-results/_inspect-home-light.png",
    fullPage: false,
  });

  // Dark theme через localStorage + перезагрузку страницы — точная
  // эмуляция flow'а пользователя (pre-hydrate скрипт в main.tsx
  // читает localStorage и ставит data-theme до React-mount'а).
  await page.evaluate(() => {
    localStorage.setItem("theme", "dark");
  });
  await page.reload();
  await page.waitForFunction(() => {
    const c = document.querySelector("canvas.maplibregl-canvas") as HTMLCanvasElement | null;
    return !!c && c.width > 0;
  }, { timeout: 15000 });
  await page.waitForTimeout(2500);
  const darkFacts = await page.evaluate(() => ({
    dataTheme: document.documentElement.getAttribute("data-theme"),
    bodyBg: getComputedStyle(document.body).backgroundColor,
  }));
  console.log("DARK FACTS:", JSON.stringify(darkFacts, null, 2));
  await page.screenshot({
    path: "test-results/_inspect-home-dark.png",
    fullPage: false,
  });
});
