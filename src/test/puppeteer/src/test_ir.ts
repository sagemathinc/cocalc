const path = require("path");
const this_file: string = path.basename(__filename, ".js");
const debuglog = require("util").debuglog("cc-" + this_file);

import chalk from "chalk";
import { Creds, Opts, PassFail, TestFiles } from "./types";
import { time_log2 } from "./time_log";
import screenshot from "./screenshot";
import { Page } from "puppeteer";
import { expect } from "chai";

//function sleep(ms: number = 0): Promise<void> {
//  return new Promise(resolve => setTimeout(resolve, ms));
//}

export const test_ir = async function (creds: Creds, opts: Opts, page: Page): Promise<PassFail> {
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

    await time_log2(`open ${TestFiles.irfile}`, tm_open_ir, creds, opts);
    const tm_ir_test = process.hrtime.bigint();

    sel = '*[cocalc-test="jupyter-cell"]';
    await page.waitForSelector(sel);
    debuglog("got jupyter cell");

    // get notebook into defined initial state
    // restart kernel and clear outputs
    sel = '[id="Kernel"]';
    await page.click(sel);
    debuglog("clicked Kernel button");

    let linkHandlers = await page.$x("//span[contains(., 'Restart and run all (do not stop on errors)...')]");
    await linkHandlers[0].click();
    debuglog("clicked Restart and run all no stop");

    linkHandlers = await page.$x("//button[contains(., 'Restart and run all')]");
    await linkHandlers[0].click();
    debuglog("clicked Restart and run all");

    const session_info = await page.$eval('div[cocalc-test="cell-output"]', function (e) {
      return (<HTMLElement>e).innerText;
    });
    debuglog("R sessionInfo:\n" + chalk.cyan(session_info));
    // FIXME const want: string = "R version 3.6.1";
    // R version is old in docker images - 3.4.4
    //const want: string = "R version 3.6.1";

    const want: string = "R version";
    expect(session_info, "missing text in R sessionInfo").to.include(want);

    sel = "button[title='Close and halt']";
    await page.click(sel);
    debuglog("clicked halt button");

    sel = '*[cocalc-test="search-input"][placeholder="Search or create file"]';
    await page.waitForSelector(sel);
    debuglog("gotfile search");

    await time_log2(this_file, tm_ir_test, creds, opts);
    await screenshot(page, opts, "cocalc-widget.png");
    pfcounts.pass += 1;
  } catch (e) {
    pfcounts.fail += 1;
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
  debuglog("R kernel test done");
  return pfcounts;
};
