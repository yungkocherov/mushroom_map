import { test } from "@playwright/test";
test("district view", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/map/1145712");
  await page.locator("canvas.maplibregl-canvas").waitFor({ state: "visible" });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: "test-results/_audit-district-desktop.png", fullPage: false });
});
