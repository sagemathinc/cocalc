import { test, expect } from "@playwright/test";
import { getUrl } from "@cocalc/playwright/global-setup";

const url = getUrl();

test("quota upgrade store tab", async ({ page }) => {
  await page.goto(url);

  // Click the store tab.
  await page.locator("header").getByRole("link", { name: "Store" }).click();

  // Expects the URL to end with /store
  await expect(page).toHaveURL(/.*\/store/);

  // Click on Quota Upgrade tab
  await page.getByRole("menuitem", { name: "Quota Upgrade" }).click();

  // Doesn't say that you have to be signed in (because we are signed in):
  await expect(page.getByText(/.*you have to be signed in.*/i)).toHaveCount(0);

  // Should say it's the quota upgrades page:
  await expect(page.getByText("Buy a Quota Upgrades License")).toHaveCount(1);

  // Has two "add to cart" buttons
  await expect(page.getByRole("button", { name: "Add to Cart" })).toHaveCount(
    2
  );
});
