/**
 * Phase 3: broken-link check.
 *
 * Phase A — статический набор канонических URL'ов из docs/redesign-2026-04.md
 * (IA & key routes). Для каждого ждём 200 (или valid SPA-fallback) от vite dev.
 * SPA-router отдаёт index.html на любой неизвестный путь, поэтому 404
 * детектится только через рендер NotFoundPage. Фоллбек проверяется
 * отдельным sanity-кейсом (`/this-route-does-not-exist`).
 *
 * Phase B — linkinator crawl главной + /methodology + /species:
 * скрейпит все <a href> и проверяет, что внутренние ссылки отдают 200.
 * Внешние ссылки (Wikipedia, MAGT и т.п.) пропускаем — они не наша
 * ответственность и flaky на CI.
 */
import { test, expect } from "@playwright/test";

const CANONICAL_PATHS = [
  "/",
  "/species",
  "/species/boletus-edulis",
  "/methodology",
  "/methodology/about",
  "/methodology/forest-data",
  "/methodology/vk-pipeline",
  "/methodology/species-registry",
  "/methodology/authors",
  "/methodology/changelog",
  "/auth",
  "/legal/privacy",
  "/legal/terms",
];

for (const path of CANONICAL_PATHS) {
  test(`canonical: ${path} renders без 404 / hard error`, async ({ page }) => {
    const resp = await page.goto(path);
    expect(resp?.status(), `HTTP status for ${path}`).toBeLessThan(400);
    // SPA fallback: vite всегда отдаёт 200 на index.html. Ловим 404 через
    // рендер NotFoundPage.
    const notFound = await page
      .getByRole("heading", { level: 1, name: /Не найдено|404|не найден/i })
      .count();
    expect(notFound, `NotFoundPage rendered for ${path}`).toBe(0);
  });
}

test("SPA fallback: неизвестный URL рендерит 404-страницу", async ({ page }) => {
  await page.goto("/this-route-does-not-exist-xyz");
  await expect(
    page.getByRole("heading", { level: 1, name: /Не найдено|404|не найден/i }),
  ).toBeVisible();
});

/**
 * Динамический crawl: linkinator не понимает client-rendered SPA
 * (vite-dev отдаёт пустой index.html, ссылок в HTML нет — Reactr
 * монтирует их потом). Поэтому собираем `<a href>` через Playwright
 * после рендера и проверяем same-origin ссылки fetch'ем.
 *
 * Покрываем: главная, /species, /species/:slug, /methodology,
 * /methodology/:slug. Внешние ссылки и mailto: пропускаем.
 */
test("dynamic crawl: внутренние ссылки с ключевых страниц не битые", async ({
  page,
  request,
}, testInfo) => {
  testInfo.setTimeout(120_000);

  const SEED_PAGES = [
    "/",
    "/species",
    "/species/boletus-edulis",
    "/methodology",
    "/methodology/about",
  ];
  const baseURL = "http://localhost:5173";
  const collected = new Set<string>();

  for (const path of SEED_PAGES) {
    await page.goto(path);
    // Ждём, пока React смонтирует хоть что-то с href (header/footer/nav/контент).
    // На главной (`/`) Layout рендерит карту без header/footer — поэтому
    // дожидаемся sidebar-меню или просто появления любого <a href>.
    await page.locator("a[href]").first().waitFor({ state: "attached", timeout: 20_000 });
    const hrefs = await page.$$eval("a[href]", (els) =>
      els.map((e) => (e as HTMLAnchorElement).getAttribute("href") || ""),
    );
    for (const h of hrefs) {
      if (!h) continue;
      if (h.startsWith("#")) continue;
      if (h.startsWith("mailto:") || h.startsWith("tel:")) continue;
      // Внешние домены пропускаем.
      if (/^https?:\/\//.test(h) && !h.startsWith(baseURL)) continue;
      // /api/ — backend (не статика; и это контракт API, отдельный тест).
      if (h.startsWith("/api/") || h.startsWith(`${baseURL}/api/`)) continue;
      // /tiles/ — PMTiles, тоже backend.
      if (h.startsWith("/tiles/") || h.startsWith(`${baseURL}/tiles/`)) continue;
      // Нормализуем в абсолютный URL.
      const abs = h.startsWith("/") ? `${baseURL}${h}` : h;
      collected.add(abs);
    }
  }

  const broken: Array<{ url: string; status: number }> = [];
  for (const url of collected) {
    const resp = await request.get(url, { failOnStatusCode: false });
    // SPA: 200 на любой /path — index.html. 3xx редиректы тоже OK.
    if (resp.status() >= 400) {
      broken.push({ url, status: resp.status() });
    }
  }
  if (broken.length > 0) {
    console.log("Broken links:", JSON.stringify(broken, null, 2));
  }
  expect(broken).toEqual([]);
  expect(collected.size).toBeGreaterThan(0);
});
