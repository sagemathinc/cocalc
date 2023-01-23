import { test, expect } from "@playwright/test";
import { URL } from "@cocalc/playwright/url";

test("test", async ({ page }) => {
  await page.goto(`${URL}/projects`);
  await page
    .getByRole("button", { name: "plus-circle Create New Project..." })
    .click();
  await page
    .getByPlaceholder("A name for your new project...")
    .fill("test miniterminal");
  await page.getByRole("button", { name: "Create Project" }).click();
  await page.getByPlaceholder("Terminal command...").click();
  await page
    .getByPlaceholder("Terminal command...")
    .fill("echo $((389+5077+234446))");
  await page.getByPlaceholder("Terminal command...").click();
  await page.getByPlaceholder("Terminal command...").press("Enter");
  await expect(page.getByText("239912")).toHaveCount(1);
});
