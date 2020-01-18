const path = require("path");
const this_file:string = path.basename(__filename, ".js");
const debuglog = require("util").debuglog("cc-" + this_file);

import chalk from "chalk";
import { Creds, Opts, PassFail, TestFiles } from "./types";
import { time_log2 } from "./time_log";
import screenshot from "./screenshot";
import { Page } from "puppeteer";
import { expect } from "chai";

export const test_sagews = async function (creds: Creds, opts: Opts, page: Page): Promise<PassFail> {
  let pfcounts: PassFail = new PassFail();
  if (opts.skip && opts.skip.test(this_file)) {
    debuglog('skipping test: ' + this_file);
    pfcounts.skip += 1;
    return pfcounts;
  }
  try {
    const tm_open_sagews = process.hrtime.bigint()

    // click the Files button
    let sel = '*[cocalc-test="Files"]';
    await page.click(sel);
    debuglog('clicked Files');

    sel = '*[cocalc-test="search-input"][placeholder="Search or create file"]';
    await page.click(sel);
    await page.type(sel, TestFiles.sagewsfile);
    debuglog(`entered ${TestFiles.sagewsfile} into file search`);

    // find and click the file link
    // split file name into base and ext because they appear in separate spans
    const z = TestFiles.sagewsfile.lastIndexOf(".");
    const tfbase = TestFiles.sagewsfile.slice(0,z);
    const tfext  = TestFiles.sagewsfile.slice(z);

    let xpt = `//a[@cocalc-test="file-line"][//span[text()="${tfbase}"]][//span[text()="${tfext}"]]`;
    await page.waitForXPath(xpt);
    sel = '*[cocalc-test="file-line"]';
    await page.click(sel);
    debuglog('clicked file line');

    await time_log2(`open ${TestFiles.sagewsfile}`, tm_open_sagews, creds, opts);
    const tm_sagews_test = process.hrtime.bigint()

    sel = 'a[data-original-title="Execute current or selected cells (unless input hidden)."]';

    await page.waitForSelector(sel);
    await page.click(sel);
    debuglog('clicked sagews Run button');

    sel = 'span.sagews-output-stdout';
    await page.waitForSelector(sel);
    await screenshot(page, opts, 'cocalc-sagews-0.png');

    const banner = await page.$eval('span.sagews-output-stdout', e => e.innerHTML);
    debuglog("sagews banner:\n" + chalk.cyan(banner));
    const want: string = "SageMath version 8.9";
    expect(banner, "missing text in sage banner").to.include(want);

    sel = 'a[data-original-title="Delete output of selected cells (unless input hidden)."]';
    await page.waitForSelector(sel);
    await page.click(sel);
    debuglog('clicked sagews delete output button');

    // close the file tab
    sel = '[cocalc-test="sagews-sample.sagews"] [data-icon="times"]';
    await page.waitForSelector(sel);
    await page.click(sel);
    debuglog('clicked file close button');

    sel = '*[cocalc-test="search-input"][placeholder="Search or create file"]';
    await page.waitForSelector(sel);
    debuglog('got file search');

    await time_log2(this_file, tm_sagews_test, creds, opts);
    await screenshot(page, opts, 'cocalc-sagews-1.png');
    pfcounts.pass += 1;

  } catch (e) {
    pfcounts.fail += 1;
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
  return pfcounts;
}
