import { chromium, FullConfig } from "@playwright/test";
import { existsSync, statSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import fetch from "node-fetch";

// @ts-ignore
import { delay } from "awaiting";

// TODO -- not sure how to specify site.
// Also we want to have multiple sites and in some cases test admin.
// This is not good enough yet.
// See https://playwright.dev/docs/auth
export const SITE = process.env.SITE ?? "test.cocalc.com";
export const URL = `https://${SITE}`;
export const STORAGE_STATE_PATH = `auth/storageState-${SITE}`;

export default async function globalSetup(_config: FullConfig) {
  if (
    existsSync(STORAGE_STATE_PATH) &&
    statSync(STORAGE_STATE_PATH).mtime >=
      new Date(new Date().valueOf() - 3600 * 6)
  ) {
    return;
  }

  // We **cannot** do sign in or sign up using login/password, because that
  // is protected by a captcha.  Instead we use an api key to authenticate.
  // The following *can't* work because we use a captcha so that robots can't
  // sign in!  You have to manually sign in, then use a browser extention to
  // get the cookies as json, and make the json file above from that right now.
  const [apiKey, account_id, password] = (await readFile(join("auth", SITE)))
    .toString()
    .split("\n");

  // See https://doc.cocalc.com/api/user_auth.html
  const response = await fetch(join(URL, "/api/v1/user_auth"), {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
    },
    method: "post",
    body: JSON.stringify({ account_id, password }),
  });
  const { auth_token, error } = await response.json();
  if (error) {
    throw Error(error);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${URL}/app?auth_token=${auth_token}`);
  await delay(3000);
  await page.context().storageState({ path: STORAGE_STATE_PATH });
  await browser.close();
}
