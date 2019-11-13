const path = require("path");
const this_file: string = path.basename(__filename, ".js");
const debuglog = require("util").debuglog("cc-" + this_file);

import chalk from "chalk";
import { Opts, PassFail, TestFiles } from "./types";
import { time_log } from "./time_log";
import screenshot from "./screenshot";
import { Page } from "puppeteer";
import { expect } from "chai";

export const test_ir = async function(opts: Opts, page: Page): Promise<PassFail> {
  const pfcounts: PassFail = new PassFail();
  if (opts.skip && opts.skip.test(this_file)) {
    debuglog("skipping test: " + this_file);
    pfcounts.skip += 1;
    return pfcounts;
  }
  try {
    const tm_open_ir = process.hrtime.bigint();

    // click the Files button
    let sel = '*[cocalc-test="Files"]';
    await page.click(sel);
    debuglog("clicked Files");

    sel = '*[cocalc-test="search-input"][placeholder="Search or create file"]';
    await page.click(sel);
    await page.type(sel, TestFiles.irfile);
    debuglog(`entered ${TestFiles.irfile} into file search`);

    // find and click the file link
    // split file name into base and ext because they appear in separate spans
    const z = TestFiles.irfile.lastIndexOf(".");
    const tfbase = TestFiles.irfile.slice(0, z);
    const tfext = TestFiles.irfile.slice(z);

    const xpt = `//a[@cocalc-test="file-line"][//span[text()="${tfbase}"]][//span[text()="${tfext}"]]`;
    await page.waitForXPath(xpt);
    sel = '*[cocalc-test="file-line"]';
    await page.click(sel);
    debuglog("clicked file line");

    time_log(`open ${TestFiles.irfile}`, tm_open_ir);
    const tm_ir_test = process.hrtime.bigint();

    sel = '*[cocalc-test="jupyter-cell"]';
    await page.waitForSelector(sel);
    debuglog("got jupyter cell");

    // get notebook into defined initial state
    // restart kernel and clear outputs
    sel = "button[id='Kernel']";
    await page.click(sel);
    debuglog("clicked Kernel button");

    let linkHandlers = await page.$x(
      "//a[contains(., 'Restart and run all (do not stop on errors)...')]"
    );
    await linkHandlers[0].click();
    debuglog("clicked Restart and run all no stop");

    linkHandlers = await page.$x(
      "//button[contains(., 'Restart and run all')]"
    );
    await linkHandlers[0].click();
    debuglog("clicked Restart and run all");

    const session_info = await page.$eval('div[cocalc-test="cell-output"]', e => e.innerHTML);
    debuglog("R sessionInfo:\n" + chalk.cyan(session_info));
    const want: string = "R version 3.6.1";
    expect(session_info, "missing text in R sessionInfo").to.include(want);

    sel = "button[title='Close and halt']";
    await page.click(sel);
    debuglog("clicked halt button");

    sel = '*[cocalc-test="search-input"][placeholder="Search or create file"]';
    await page.waitForSelector(sel);
    debuglog("gotfile search");

    time_log("R kernel test", tm_ir_test);
    await screenshot(page, opts, "cocalc-widget.png");
    pfcounts.pass += 1;
  } catch (e) {
    pfcounts.fail += 1;
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
  debuglog("R kernel test done");
  return pfcounts;
};
