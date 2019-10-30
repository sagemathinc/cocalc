const path = require("path");
const this_file: string = path.basename(__filename, ".js");
const debuglog = require("util").debuglog("cc-" + this_file);

const puppeteer = require("puppeteer");
import chalk from "chalk";
import { Creds, Opts, ApiGetString } from "./types";
import { time_log } from "./time_log";
import { expect } from "chai";

const LONG_TIMEOUT = 70000; // msec

export const get_api_key = async function(
  creds: Creds,
  opts: Opts
): Promise<ApiGetString> {
  let browser;
  let ags: ApiGetString = new ApiGetString();
  if (opts.skip && opts.skip.test(this_file)) {
    debuglog("skipping test: " + this_file);
    ags.skip += 1;
    return ags;
  }
  try {
    const tm_launch_browser = process.hrtime.bigint();
    browser = await puppeteer.launch({
      ignoreHTTPSErrors: true,
      headless: opts.headless,
      executablePath: opts.path,
      slowMo: 50 // without this sometimes the wrong project is selected
    });

    const page = (await browser.pages())[0];
    const version: string = await page.browser().version();
    debuglog("browser", version);

    time_log("launch browser for api key", tm_launch_browser);
    const tm_login = process.hrtime.bigint();
    await page.setDefaultTimeout(LONG_TIMEOUT);

    const url: string = creds.url + "?get_api_key=docs";
    await page.goto(url);
    debuglog("got url", url);

    let sel = '*[cocalc-test="sign-in-email"]';
    await page.click(sel);
    await page.keyboard.type(creds.email);
    debuglog("entered email", creds.email);

    sel = '*[cocalc-test="sign-in-password"]';
    await page.click(sel);
    await page.keyboard.type(creds.passw);
    debuglog("entered password");

    await page.setRequestInterception(true);

    sel = '*[cocalc-test="sign-in-submit"]';
    await page.click(sel);
    debuglog("clicked submit");
    time_log("login", tm_login);

    // intercepted url looks like https://authenticated/?api_key=sk_hJKSJax....
    const api_key: string = await new Promise<string>(function(resolve) {
      page.on("request", async function(request: any) {
        const regex: RegExp = /.*=/;
        const u: string = await request.url();
        if (/authenticated/.test(u)) {
          request.continue();
          const result: string = u.replace(regex, "");
          resolve(result);
        }
      });
    });
    debuglog("api_key", api_key.substr(0, 5) + "...");
    expect(api_key.substr(0, 3)).to.equal("sk_");
    await page.setRequestInterception(false);
    ags.pass += 1;
    ags.result = api_key;

    time_log(this_file, tm_launch_browser);
  } catch (e) {
    ags.fail += 1;
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
  debuglog(this_file + " done");
  browser.close();
  return ags;
};
