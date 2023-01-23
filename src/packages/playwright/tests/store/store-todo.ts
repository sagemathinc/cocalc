import { test, expect } from "@playwright/test";
import { URL } from "@cocalc/playwright/url";

// @ts-ignore
import { delay } from "awaiting";

test("quota upgrade store tab", async ({ page }) => {
  await page.goto(URL);

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

test("item -> cart -> checkout", async ({ page }) => {
  await page.goto(URL);
  // Click the store tab.
  await page.locator("header").getByRole("link", { name: "Store" }).click();
  // Click on Quota Upgrade tab
  await page.getByRole("menuitem", { name: "Quota Upgrade" }).click();
  // Click button to add to cart
  await page.getByRole("button", { name: "Add to Cart" }).nth(1).click();
  // Confirm we are on the shopping cart page:
  await expect(page).toHaveURL(/.*\/store\/cart/);
  // Confirm there is a checkout button
  await expect(
    page.getByRole("button", { name: "Proceed to Checkout" })
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Proceed to Checkout" }).click();
  await expect(page).toHaveURL(/.*\/store\/checkout/);
  // Now go back to the cart and delete the item, since otherwise our
  // cart will get pretty full.
  await page.getByRole("menuitem", { name: "Cart" }).click();
  await expect(page).toHaveURL(/.*\/store\/cart/);
  // TODO: this hangs when there is only 1 item in the cart, but works for more than one!?
  await page.getByText("Delete").nth(1).click();
  // A popconfirm:
  await page.getByText("Yes, delete this item").click();
});
