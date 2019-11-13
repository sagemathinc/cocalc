const path = require("path");
const this_file:string = path.basename(__filename, ".js");
const debuglog = require("util").debuglog("cc-" + this_file);

import chalk from "chalk";
import { Opts, TestGetBoolean } from "./types";
import { time_log } from "./time_log";
import { Page } from "puppeteer";
const puppeteer = require("puppeteer");

export const is_admin = async function (opts: Opts, page: Page): Promise<TestGetBoolean> {
  let pfcounts: TestGetBoolean = new TestGetBoolean();
  if (opts.skip && opts.skip.test(this_file)) {
    debuglog('skipping test: ' + this_file);
    pfcounts.skip += 1;
    return pfcounts;
  }
  try {
    const tm_is_admin = process.hrtime.bigint()

    // look for "Help" button, just to make sure we're in the right place
    let sel = '*[cocalc-test="Account"]';
    await page.waitForSelector(sel);
    debuglog('found Account tab');

    // look for "Admin" button - return true if it's found within 2 sec
    pfcounts.result = false;
    try {
      let sel = '*[cocalc-test="Admin"]';
      await page.waitForSelector(sel, {timeout: 2000});
      debuglog('found Admin tab');
      pfcounts.result = true;
    } catch (e) {
      if (e instanceof puppeteer.errors.TimeoutError) {
        debuglog(`not Admin: ${e.message}`);
      } else {
        console.log(chalk.red(`not timeout ERROR: ${e.message}`));
        throw e;
      }
    }

    time_log("sagews test", tm_is_admin);
    pfcounts.pass += 1;

  } catch (e) {
    pfcounts.fail += 1;
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
  return pfcounts;
}
