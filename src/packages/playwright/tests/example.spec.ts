import { test, expect } from "@playwright/test";
import { URL } from "@cocalc/playwright/global-setup";

test("has title", async ({ page }) => {
  await page.goto(URL);

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Collaborative Calculation/);
});

test("features tab", async ({ page }) => {
  await page.goto(URL);

  // Click the features tab.
  await page.getByRole("link", { name: /^Features/ }).nth(1).click();

  // Expects the URL to end with /features
  await expect(page).toHaveURL(/.*\/features$/);
});

test("load the static frontend app", async ({ page }) => {
  await page.goto(`${URL}/static/app.html`);
  // Since we are assumed to be signed in, we end up at projects:
  await expect(page).toHaveURL(/.*\/projects/);
});
