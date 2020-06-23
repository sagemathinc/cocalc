/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

const path = require("path");
const this_file: string = path.basename(__filename, ".js");
const debuglog = require("util").debuglog("cc-" + this_file);

import chalk from "chalk";
import { Creds, Opts, PassFail, TestFiles } from "./types";
import { time_log2 } from "./time_log";
import screenshot from "./screenshot";
import { Page } from "puppeteer";
import { expect } from "chai";

export const test_widget = async function (creds: Creds, opts: Opts, page: Page): Promise<PassFail> {
  const pfcounts: PassFail = new PassFail();
  if (opts.skip && opts.skip.test(this_file)) {
    debuglog("skipping test: " + this_file);
    pfcounts.skip += 1;
    return pfcounts;
  }
  try {
    const tm_open_widget = process.hrtime.bigint();

    // click the Files button
    let sel = '*[cocalc-test="Files"]';
    await page.click(sel);
    debuglog("clicked Files");

    sel = '*[cocalc-test="search-input"][placeholder="Search or create file"]';
    await page.click(sel);
    await page.type(sel, TestFiles.widgetfile);
    debuglog(`entered ${TestFiles.widgetfile} into file search`);

    // find and click the file link
    // split file name into base and ext because they appear in separate spans
    const z = TestFiles.widgetfile.lastIndexOf(".");
    const tfbase = TestFiles.widgetfile.slice(0, z);
    const tfext = TestFiles.widgetfile.slice(z);

    const xpt = `//a[@cocalc-test="file-line"][//span[text()="${tfbase}"]][//span[text()="${tfext}"]]`;
    await page.waitForXPath(xpt);
    sel = '*[cocalc-test="file-line"]';
    await page.click(sel);
    debuglog("clicked file line");

    await time_log2(`open ${TestFiles.widgetfile}`, tm_open_widget, creds, opts);
    const tm_widget_test = process.hrtime.bigint();

    sel = '*[cocalc-test="jupyter-cell"]';
    await page.waitForSelector(sel);
    debuglog("got jupyter cell");

    // get notebook into defined initial state
    // restart kernel and clear outputs
    sel = "[id='Kernel']";
    await page.click(sel);
    debuglog("clicked Kernel button");

    let linkHandlers = await page.$x("//span[contains(., 'Restart and run all (do not stop on errors)...')]");
    await linkHandlers[0].click();
    debuglog("clicked Restart and run all no stop");

    linkHandlers = await page.$x("//button[contains(., 'Restart and run all')]");
    await linkHandlers[0].click();
    debuglog("clicked Restart and run all");

    sel = "[cocalc-test='jupyter-cell']";
    const empty_exec_str: string = "In []:";
    const restart_max_tries = 300;
    let text: string = "XX";
    let step: number = 0;
    for (; step < restart_max_tries; step++) {
      text = await page.$eval(sel, function (e) {
        return (<HTMLElement>e).innerText.toString();
      });
      if (step > 0 && step % 10 == 0) debuglog(step, ": readout: ", text.substr(0, 40));
      if (text.startsWith(empty_exec_str)) break;
      await page.waitFor(100);
    }
    const enpfx: string = text.substr(0, empty_exec_str.length);
    debuglog("after ", step, "tries, exec number starts with ", enpfx);
    expect(enpfx).to.equal(empty_exec_str);

    sel = "div.widget-readout";
    await page.waitForSelector(sel);
    debuglog("got widget readout");

    const restart_max_triesw = 200;
    let textw: string = "XX";
    let stepw: number = 0;
    for (; stepw < restart_max_triesw; stepw++) {
      textw = await page.$eval(sel, function (e) {
        return (<HTMLElement>e).innerText.toString();
      });
      debuglog(stepw, ": readout: ", textw);
      if (textw == "0") break;
      // wait 1 second and try again
      await page.waitFor(200);
    }
    debuglog("after ", stepw, "tries, readout is ", textw);
    expect(textw).to.equal("0");

    // readout of slider should be zero
    // WARNING: puppeteer waitForFunction does not work with async functions
    // https://github.com/GoogleChrome/puppeteer/issues/4045

    //await page.waitForFunction('document.querySelector("div.widget-readout").innerText==0');
    debuglog("got 0 readout");

    // find the slider bounding box
    // result is an object like this:
    // { x: 166, y: 288, width: 212, height: 28, top: 288, right: 378, bottom: 316, left: 166 }
    // use "!" after querySelector to suppress TSC "possibly null" error
    const box = await page.evaluate(() => {
      const gbcr = function (element: any) {
        const { top, right, bottom, left, width, height, x, y } = element!.getBoundingClientRect();
        return { top, right, bottom, left, width, height, x, y };
      };
      const sr = document.querySelector(".ui-slider");
      return gbcr(sr);
    });
    debuglog(`slider at (${box.left},${box.top}) to (${box.right},${box.bottom})`);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    debuglog("clicked slider");

    // readout of slider should be fifty
    await page.waitForFunction('document.querySelector("div.widget-readout").innerText==50');
    debuglog("got 50 readout");

    sel = "button[title='Close and halt']";
    await page.click(sel);
    debuglog("clicked halt button");

    sel = '*[cocalc-test="search-input"][placeholder="Search or create file"]';
    await page.waitForSelector(sel);
    debuglog("gotfile search");

    await time_log2("widget test", tm_widget_test, creds, opts);
    await screenshot(page, opts, "cocalc-widget.png");
    pfcounts.pass += 1;
  } catch (e) {
    pfcounts.fail += 1;
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
  debuglog("widget test done");
  return pfcounts;
};
