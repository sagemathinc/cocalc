import { test, expect } from "@playwright/test";
import { URL } from "@cocalc/playwright/url";

test("has title", async ({ page }) => {
  await page.goto(URL);

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Collaborative Calculation/);
});

test("docs tab", async ({ page }) => {
  await page.goto(URL);

  // Click the docs tab.
  await page.getByRole("link", { name: /^Docs$/ }).click();

  // Expects the URL to end with /info (yes, docs would make more sense...)
  await expect(page).toHaveURL(/.*\/info/);
});

test("load the frontend app projects listing", async ({ page }) => {
  await page.goto(`${URL}/projects`);
  // Since we are assumed to be signed in, we end up at projects:
  await expect(page).toHaveURL(/.*\/projects/);
});
