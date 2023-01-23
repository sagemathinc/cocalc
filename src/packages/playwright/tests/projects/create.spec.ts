/*
Create a new project
*/

import { test, expect } from "@playwright/test";
import { URL } from "@cocalc/playwright/url";

test("do arithmetic via the miniterminal", async ({ page }) => {
  await page.goto(`${URL}/projects`);
  await expect(page).toHaveURL(/.*\/projects/);
  const BigCreateButton = page.getByRole("button", {
    name: "plus-circle Create New Project...",
  });
  // @ts-ignore
  if (!(await page.isDisabled(BigCreateButton._selector))) {
    await BigCreateButton.click();
  }
  const title = `Test Project - ${Math.random()}`;
  await page.getByPlaceholder("A name for your new project...").fill(title);
  await page.getByRole("button", { name: "Create Project" }).click();

  // Confirm the project with that title now exists
  await page.goto(`${URL}/projects`);
  await expect(page.getByText(title)).toHaveCount(1);
});
