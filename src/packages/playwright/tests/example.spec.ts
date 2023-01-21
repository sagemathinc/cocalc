import { test, expect } from "@playwright/test";

const site = process.env.SITE ?? "https://cocalc.com";

test("has title", async ({ page }) => {
  await page.goto(site);

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Collaborative Calculation/);
});

test("features tab", async ({ page }) => {
  await page.goto(site);

  // Click the features tab.
  await page.getByRole("link", { name: /^Features/ }).click();

  // Expects the URL to end with /features
  await expect(page).toHaveURL(/.*\/features$/);
});

test("store tab", async ({ page }) => {
  await page.goto(site);

  // Click the features tab.
  await page.getByRole("link", { name: /^Store/ }).click();

  // Expects the URL to end with /store
  await expect(page).toHaveURL(/.*\/store/);
});

test("load the static fronend app", async ({ page }) => {
  await page.goto(`${site}/static/app.html`);
  // Expects the URL to end with /settings, since that's what happens.
  await expect(page).toHaveURL(/.*\/settings/);
});
