import { test, expect } from "@playwright/test";
import { getUrl } from "@cocalc/playwright/global-setup";

const url = getUrl();

test("has title", async ({ page }) => {
  await page.goto(url);

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Collaborative Calculation/);
});

test("features tab", async ({ page }) => {
  await page.goto(url);

  // Click the features tab.
  await page.getByRole("link", { name: /^Features/ }).nth(1).click();

  // Expects the URL to end with /features
  await expect(page).toHaveURL(/.*\/features$/);
});

test("load the static frontend app", async ({ page }) => {
  await page.goto(`${url}/static/app.html`);
  // Expects the URL to end with /settings, since that's what happens.
  await expect(page).toHaveURL(/.*\/settings/);
});
