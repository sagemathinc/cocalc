import { chromium, FullConfig } from "@playwright/test";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";

// TODO -- not sure how to specify site.
// Also we want to have multiple sites and in some cases test admin.
// This is not good enough yet.
// See https://playwright.dev/docs/auth
function getSite(): string {
  return process.env.SITE ?? "test.cocalc.com";
}

export function getUrl(): string {
  return `https://${getSite()}`;
}

async function globalSetup(_config: FullConfig) {
  if (existsSync("auth/storageState.json")) {
    return;
  }
  // The following *can't* work because we use a captcha so that robots can't
  // sign in!  You have to manually sign in, then use a browser extention to
  // get the cookies as json, and make the json file above from that right now.
  const site = getSite();
  const [user, password] = (await readFile(join("auth", site)))
    .toString()
    .split("\n");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`https://${site}/auth/sign-in`);
  await page.getByPlaceholder("Email address").fill(user);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  //await page.getByText("Signed in as").click();
  // Save signed-in state to file.
  await page.context().storageState({ path: "auth/storageState.json" });
  await browser.close();
}

export default globalSetup;
