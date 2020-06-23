/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

const path = require("path");
const this_file: string = path.basename(__filename, ".js");
const debuglog = require("util").debuglog("cc-" + this_file);

const puppeteer = require("puppeteer");
import chalk from "chalk";
import { Creds, Opts, PassFail } from "./types";
import { time_log2 } from "./time_log";
import { Page } from "puppeteer";

const LONG_TIMEOUT = 70000; // msec

export const sign_up = async function (creds: Creds, opts: Opts): Promise<PassFail> {
  let browser;
  const pfcounts: PassFail = new PassFail();
  if (opts.skip && opts.skip.test(this_file)) {
    debuglog("skipping test: " + this_file);
    pfcounts.skip += 1;
    return pfcounts;
  }
  try {
    const tm_launch_browser = process.hrtime.bigint();
    browser = await puppeteer.launch({
      ignoreHTTPSErrors: true,
      headless: opts.headless,
      executablePath: opts.path,
      slowMo: 50 // without this sometimes the wrong project is selected
    });

    const page: Page = (await browser.pages())[0];
    //var Type = require('type-of-is');
    //console.log(Type.string(page));
    const version: string = await page.browser().version();
    debuglog("browser", version);

    await time_log2("launch browser", tm_launch_browser, creds, opts);
    const tm_signup = process.hrtime.bigint();
    await page.setDefaultTimeout(LONG_TIMEOUT);

    await page.goto(creds.url);
    debuglog("loaded", creds.url);

    let sel: string;

    sel = '*[cocalc-test="sign-up-tos"]';
    await page.click(sel);
    debuglog("checked ToS");

    if (creds.token) {
      sel = '*[cocalc-test="sign-up-token"]';
      await page.click(sel);
      await page.keyboard.type(creds.token);
      debuglog("entered token");
    } else {
      debuglog("no token specified in creds");
    }

    const firstname: string = creds.firstname!;
    sel = '*[cocalc-test="sign-up-first-name';
    await page.click(sel);
    await page.keyboard.type(firstname);
    debuglog("entered first name", firstname);

    const lastname: string = creds.lastname!;
    sel = '*[cocalc-test="sign-up-last-name';
    await page.click(sel);
    await page.keyboard.type(lastname);
    debuglog("entered last name", lastname);

    sel = '*[cocalc-test="sign-up-email"]';
    await page.click(sel);
    await page.keyboard.type(creds.email);
    debuglog("entered email", creds.email);

    sel = '*[cocalc-test="sign-up-password"]';
    await page.click(sel);
    await page.keyboard.type(creds.passw);
    debuglog("entered password");

    sel = '*[cocalc-test="sign-up-submit"]';
    await page.click(sel);

    sel = '*[cocalc-test="project-button"]';
    await page.waitForSelector(sel);
    await page.click(sel);

    await time_log2("signup", tm_signup, creds, opts);
    pfcounts.pass += 1;

    await time_log2(this_file, tm_launch_browser, creds, opts);
  } catch (e) {
    pfcounts.fail += 1;
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
  debuglog("signup session done - closing browser");
  browser.close();
  return pfcounts;
};
