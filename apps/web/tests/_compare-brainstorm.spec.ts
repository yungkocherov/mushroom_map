/**
 * Снимок brainstorm-мокапов из .superpowers/brainstorm/6735-1777312627/
 * для side-by-side сравнения с реальным сайтом.
 */
import { test } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRAINSTORM = path.resolve(
  __dirname,
  "../../../.superpowers/brainstorm/6735-1777312627/content",
);

test.describe("brainstorm mockups", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const f of [
    "hero-c-fullsize.html",
    "visual-language.html",
    "aux-pages.html",
    "map-detail.html",
  ]) {
    test(`${f}`, async ({ page }) => {
      await page.goto("file://" + path.join(BRAINSTORM, f).replace(/\\/g, "/"));
      await page.waitForTimeout(800);
      await page.screenshot({
        path: `test-results/_brainstorm-${f.replace(".html", "")}.png`,
        fullPage: true,
      });
    });
  }
});
