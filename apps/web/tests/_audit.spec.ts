/**
 * Полный обход сайта — снимаем скрин каждой страницы в light/dark,
 * desktop/mobile, плюс дампим DOM-факты + console-error'ы.
 * Цель: один прогон → полная карта проблем без ручного клика.
 */
import { test } from "@playwright/test";

const PAGES = [
  { name: "home", path: "/", waitForCanvas: true },
  { name: "species", path: "/species", waitForSel: 'a[href^="/species/"]' },
  { name: "species-detail", path: "/species/boletus-edulis", waitForSel: "h1" },
  { name: "methodology", path: "/methodology", waitForSel: "h1" },
  { name: "methodology-article", path: "/methodology/about", waitForSel: "h1" },
  { name: "spots-auth", path: "/spots", waitForSel: "h1" }, // редиректит на /auth
  { name: "auth", path: "/auth", waitForSel: "h1" },
  { name: "404", path: "/no-such-route", waitForSel: "h1" },
];

async function captureAt(
  page: import("@playwright/test").Page,
  pageInfo: typeof PAGES[number],
  variantSuffix: string,
) {
  const errors: string[] = [];
  const onErr = (m: import("@playwright/test").ConsoleMessage) => {
    if (m.type() === "error") errors.push(m.text());
  };
  page.on("console", onErr);
  const onPageErr = (e: Error) => errors.push("pageerror: " + e.message);
  page.on("pageerror", onPageErr);

  await page.goto(pageInfo.path);
  if (pageInfo.waitForCanvas) {
    await page.waitForFunction(() => {
      const c = document.querySelector("canvas.maplibregl-canvas") as HTMLCanvasElement | null;
      return !!c && c.width > 0;
    }, { timeout: 15000 });
    await page.waitForTimeout(2500);
  } else if (pageInfo.waitForSel) {
    await page.locator(pageInfo.waitForSel).first().waitFor({ state: "visible" });
    await page.waitForTimeout(400);
  }

  const facts = await page.evaluate(() => ({
    title: document.title,
    h1: document.querySelector("h1")?.textContent?.trim().slice(0, 100) ?? null,
    hasHeader: !!document.querySelector("header"),
    hasFooter: !!document.querySelector("footer"),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    dataTheme: document.documentElement.getAttribute("data-theme"),
    imageCount: document.images.length,
    brokenImages: Array.from(document.images)
      .filter((img) => img.complete && img.naturalWidth === 0)
      .map((img) => img.src),
    missingAlt: Array.from(document.images)
      .filter((img) => !img.alt && !img.getAttribute("aria-hidden"))
      .map((img) => img.src.slice(0, 80)),
    headings: Array.from(document.querySelectorAll("h1,h2,h3"))
      .map((h) => `${h.tagName}: ${h.textContent?.trim().slice(0, 60)}`)
      .slice(0, 12),
  }));

  await page.screenshot({
    path: `test-results/_audit-${pageInfo.name}-${variantSuffix}.png`,
    fullPage: !pageInfo.waitForCanvas,
  });
  page.off("console", onErr);
  page.off("pageerror", onPageErr);
  return { facts, errors };
}

test("desktop light: all pages", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const report: Record<string, unknown> = {};
  for (const p of PAGES) {
    const { facts, errors } = await captureAt(page, p, "desktop-light");
    report[p.name] = { facts, errors };
  }
  console.log("===== AUDIT DESKTOP LIGHT =====");
  console.log(JSON.stringify(report, null, 2));
});

test("desktop dark: all pages", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // Pre-set dark theme via localStorage on a fresh navigation.
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("theme", "dark"));
  const report: Record<string, unknown> = {};
  for (const p of PAGES) {
    const { facts, errors } = await captureAt(page, p, "desktop-dark");
    report[p.name] = { facts, errors };
  }
  console.log("===== AUDIT DESKTOP DARK =====");
  console.log(JSON.stringify(report, null, 2));
});

test("mobile light: all pages", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const report: Record<string, unknown> = {};
  for (const p of PAGES) {
    const { facts, errors } = await captureAt(page, p, "mobile-light");
    report[p.name] = { facts, errors };
  }
  console.log("===== AUDIT MOBILE LIGHT =====");
  console.log(JSON.stringify(report, null, 2));
});
