const path = require("path");
const this_file: string = path.basename(__filename, ".js");
const debuglog = require("util").debuglog("cc-" + this_file);

import chalk from "chalk";
import { Opts, PassFail } from "./types";
import { time_log } from "./time_log";
import screenshot from "./screenshot";
import { Page, Browser } from "puppeteer";
//import { expect } from "chai";

//const FOLDER_URL = "https://cocalc.com/projects/4a5f0542-5873-4eed-a85c-a18c706e8bcd/files/support/";
//const FILE_URL   = "https://cocalc.com/projects/4a5f0542-5873-4eed-a85c-a18c706e8bcd/files/support/period-lattice-sage.ipynb";

const FOLDER_URL = "http://localhost:45425/77a92d07-c122-4577-9c4c-c051379cacfe/port/45425/share/fd34b186-2f78-4e99-8850-2b9d5d45a87e/pubdir";
const FILE_URL   = "http://localhost:45425/77a92d07-c122-4577-9c4c-c051379cacfe/port/45425/share/fd34b186-2f78-4e99-8850-2b9d5d45a87e/pubdir/date.txt";

//function sleep(ms: number = 0): Promise<void> {
//    return new Promise(resolve => setTimeout(resolve, ms));
//}

export const test_shared_file = async function(opts: Opts, browser: Browser): Promise<PassFail> {
  const pfcounts: PassFail = new PassFail();
  if (opts.skip && opts.skip.test(this_file)) {
    debuglog("skipping test: " + this_file);
    pfcounts.skip += 1;
    return pfcounts;
  }
  try {
    const tm_shared_folder = process.hrtime.bigint();
    const page1: Page = (await browser!.newPage());
    await page1.goto(FOLDER_URL);
    let sel = 'div[cocalc-test="public-directory"]';
    await page1.waitForSelector(sel);
    debuglog('got public folder listing');

    //const sleep_sec: number = 5;
    //debuglog(`sleeping for ${sleep_sec} seconds`);
    //await sleep(sleep_sec * 1000);

    await screenshot(page1, opts, "cocalc-shared-folder.png");
    await page1.close;
    pfcounts.pass += 1;
    time_log("shared folder", tm_shared_folder);

    const tm_shared_file = process.hrtime.bigint();
    const page2: Page = (await browser!.newPage());
    await page2.goto(FILE_URL);
    sel = 'div[cocalc-test="public-authors"]';
    await page2.waitForSelector(sel);
    debuglog('got public file');

    //debuglog(`sleeping for ${sleep_sec} seconds`);
    //await sleep(sleep_sec * 1000);
    await screenshot(page2, opts, "cocalc-shared-file.png");
    await page2.close;
    pfcounts.pass += 1;
    time_log("shared file", tm_shared_file);
  } catch (e) {
    pfcounts.fail += 1;
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
  debuglog("widget test done");
  return pfcounts;
};
