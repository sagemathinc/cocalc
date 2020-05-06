/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

const path = require("path");
const this_file: string = path.basename(__filename, ".js");
const debuglog = require("util").debuglog("cc-" + this_file);

import chalk from "chalk";
import { Creds, Opts, PassFail } from "./types";
import { time_log2 } from "./time_log";
import screenshot from "./screenshot";
import { Page, Browser } from "puppeteer";
//import { expect } from "chai";

//function sleep(ms: number = 0): Promise<void> {
//    return new Promise(resolve => setTimeout(resolve, ms));
//}

export const test_shared_file = async function (creds: Creds, opts: Opts, browser: Browser): Promise<PassFail> {
  const pfcounts: PassFail = new PassFail();
  if (opts.skip && opts.skip.test(this_file)) {
    debuglog("skipping test: " + this_file);
    pfcounts.skip += 1;
    return pfcounts;
  }
  if (!(creds.shared_folder && creds.shared_file)) {
    debuglog("shared urls not defined, skipping test: " + this_file);
    pfcounts.skip += 1;
    return pfcounts;
  }
  try {
    const tm_shared_folder = process.hrtime.bigint();
    const page1: Page = await browser!.newPage();
    await page1.goto(creds.shared_folder);
    let sel = 'div[cocalc-test="public-directory"]';
    await page1.waitForSelector(sel);
    debuglog("got public folder listing");

    //const sleep_sec: number = 5;
    //debuglog(`sleeping for ${sleep_sec} seconds`);
    //await sleep(sleep_sec * 1000);

    await screenshot(page1, opts, "cocalc-shared-folder.png");
    await page1.close;
    pfcounts.pass += 1;
    await time_log2("shared folder", tm_shared_folder, creds, opts);

    const tm_shared_file = process.hrtime.bigint();
    const page2: Page = await browser!.newPage();
    await page2.goto(creds.shared_file);
    sel = 'div[cocalc-test="public-authors"]';
    await page2.waitForSelector(sel);
    debuglog("got public file");

    //debuglog(`sleeping for ${sleep_sec} seconds`);
    //await sleep(sleep_sec * 1000);
    await screenshot(page2, opts, "cocalc-shared-file.png");
    await page2.close;
    pfcounts.pass += 1;
    await time_log2(this_file, tm_shared_file, creds, opts);
  } catch (e) {
    pfcounts.fail += 1;
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
  debuglog("widget test done");
  return pfcounts;
};
