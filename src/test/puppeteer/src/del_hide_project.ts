const path = require("path");
const this_file: string = path.basename(__filename, ".js");
const debuglog = require("util").debuglog("cc-" + this_file);

import chalk from "chalk";
import { Opts, PassFail } from "./types";
import { time_log } from "./time_log";
import { Page } from "puppeteer";

import screenshot from "./screenshot";

export const del_hide_project = async function(
  opts: Opts,
  page: Page
): Promise<PassFail> {
  // assume puppeteer has opened the project specified in creds before this is called
  let pfcounts: PassFail = new PassFail();
  if (opts.skip && opts.skip.test(this_file)) {
    debuglog("skipping test: " + this_file);
    pfcounts.skip += 1;
    return pfcounts;
  }
  try {
    const tm_del_hide = process.hrtime.bigint();

    let sel;

    // click the project Settings button
    sel = '*[cocalc-test="Settings"]';
    await page.click(sel);
    debuglog("clicked Settings");

    // click hide-project etc.
    sel = `*[cocalc-test="${opts.xprj}-project"]`;
    await page.click(sel);

    debuglog(`clicked ${opts.xprj}-project`);
    if (opts.xprj === "delete") {
      sel = '*[cocalc-test="please-delete-project"]';
      await page.click(sel);
      await screenshot(page, opts, "cocalc-delete-project0.png");
      debuglog(`confirmed delete project`);
    }

    // to exit Settings, click the Files button and wait for search box
    sel = '*[cocalc-test="Files"]';
    await page.click(sel);
    debuglog("clicked Files");

    sel = '*[cocalc-test="search-input"]';
    await page.waitForSelector(sel);

    time_log(`project ${opts.xprj}`, tm_del_hide);
    pfcounts.pass += 1;
  } catch (e) {
    pfcounts.fail += 1;
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
  return pfcounts;
};
