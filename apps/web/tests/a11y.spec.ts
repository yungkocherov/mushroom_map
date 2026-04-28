/**
 * Phase 3: a11y suite через axe-playwright.
 *
 * Прогоняем axe-core (WCAG 2.1 AA) на каноничных страницах редизайна.
 * Спека Phase 3: 0 violations уровня serious + critical.
 *
 * Главную (/) намеренно НЕ покрываем axe'ом — MapLibre GL рендерит
 * свой canvas + control'ы с собственными ARIA-нарушениями (issue
 * упомянут в их репо), править у себя нельзя. Контентные страницы —
 * под нашим контролем.
 *
 * Зависит от живого API на :8000 (/species).
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PAGES: Array<{ name: string; path: string; waitFor?: string }> = [
  { name: "species-list", path: "/species", waitFor: 'a[href^="/species/"]' },
  {
    name: "species-detail",
    path: "/species/boletus-edulis",
    waitFor: "h1",
  },
  { name: "methodology-hub", path: "/methodology", waitFor: "h1" },
  { name: "methodology-article", path: "/methodology/about", waitFor: "h1" },
];

for (const p of PAGES) {
  test(`a11y: ${p.name} (${p.path}) — нет serious/critical violations`, async ({
    page,
  }) => {
    await page.goto(p.path);
    if (p.waitFor) {
      await page.locator(p.waitFor).first().waitFor({ state: "visible" });
    }

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );

    if (blocking.length > 0) {
      // Подробный лог в test-report — иначе только id видно.
      console.log(
        JSON.stringify(
          blocking.map((v) => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            nodes: v.nodes.map((n) => n.target),
          })),
          null,
          2,
        ),
      );
    }
    expect(blocking).toEqual([]);
  });
}

/**
 * /spots требует auth (ProtectedRoute). axe гоняем на public-странице
 * /auth, куда нас редиректнёт ProtectedRoute. Это всё равно нагружает
 * Layout + header + footer, на что и нужно проверить контраст/landmark.
 */
test("a11y: spots-auth-redirect (/spots → /auth) — нет serious/critical violations", async ({
  page,
}) => {
  await page.goto("/spots");
  await page.waitForURL(/\/auth/);
  await page.locator("h1").first().waitFor({ state: "visible" });

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  if (blocking.length > 0) {
    console.log(
      JSON.stringify(
        blocking.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.map((n) => n.target),
        })),
        null,
        2,
      ),
    );
  }
  expect(blocking).toEqual([]);
});
