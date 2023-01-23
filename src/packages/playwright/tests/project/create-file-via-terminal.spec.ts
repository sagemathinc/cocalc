import { test, expect } from "@playwright/test";
import { URL } from "@cocalc/playwright/url";

test.skip("create a file via the terminal", async ({ page }) => {
  await page.goto(`${URL}/projects`);
  await page
    .getByRole("button", { name: "plus-circle Create New Project..." })
    .click();
  await page
    .getByPlaceholder("A name for your new project...")
    .fill("test create file via terminal");
  await page.getByPlaceholder("A name for your new project...").press("Enter");
  await page
    .getByRole("button", { name: "plus-circle Create or Upload Files..." })
    .click();
  await page.getByRole("button", { name: "code Linux Terminal" }).click();
  await page
    .getByRole("textbox", { name: "Terminal input" })
    .fill("echo 'a new file containing cocalc' > bar.txt");
  await page.getByRole("textbox", { name: "Terminal input" }).press("Enter");
  await page
    .getByRole("tab", { name: "folder-open Files" })
    .getByText("Files")
    .click();
  await page.getByText("bar.txt").click();
  await expect(page.getByText("a new file containing cocalc")).toHaveCount(1);
});
