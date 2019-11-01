const path = require('path');
const this_file:string = path.basename(__filename, '.js');
const debuglog = require('util').debuglog('cc-' + this_file);

import chalk from 'chalk';
import { Opts, PassFail, TestFiles } from './types';
import { time_log } from './time_log';
import screenshot from './screenshot';
import { Page } from 'puppeteer';
import { expect } from 'chai';

export const test_sage_ker = async function (opts: Opts, page: Page): Promise<PassFail> {
  let pfcounts: PassFail = new PassFail();
  if (opts.skip && opts.skip.test(this_file)) {
    debuglog('skipping test: ' + this_file);
    pfcounts.skip += 1;
    return pfcounts;
  }
  try {
    const tm_open_sage_ker = process.hrtime.bigint()

    // click the Files button
    let sel = '*[cocalc-test="Files"]';
    await page.click(sel);
    debuglog('clicked Files');

    sel = '*[cocalc-test="search-input"][placeholder="Search or create file"]';
    await page.click(sel);
    await page.type(sel, TestFiles.sageipynbfile);
    debuglog(`entered ${TestFiles.sageipynbfile} into file search`);

    // find and click the file link
    // split file name into base and ext because they appear in separate spans
    const z = TestFiles.sageipynbfile.lastIndexOf(".");
    const tfbase = TestFiles.sageipynbfile.slice(0,z);
    const tfext  = TestFiles.sageipynbfile.slice(z);

    let xpt = `//a[@cocalc-test="file-line"][//span[text()="${tfbase}"]][//span[text()="${tfext}"]]`;
    await page.waitForXPath(xpt);
    sel = '*[cocalc-test="file-line"]';
    await page.click(sel);
    debuglog('clicked file line');

    time_log(`open ${TestFiles.sageipynbfile}`, tm_open_sage_ker);
    const tm_sage_ker_test = process.hrtime.bigint()

    sel = '*[cocalc-test="jupyter-cell"]';
    await page.waitForSelector(sel);
    debuglog('got sage ipynb jupyter cell');

    await screenshot(page, opts, 'wait-for-kernel-button.png');

    // sage kernel takes longer to start than python 3 system kernel
    //const dqs: string = 'document.querySelector("button[id=\'Kernel\']").innerText=="Kernel"';
    //debuglog('dqs',dqs);
    //await page.waitForFunction(dqs);
    //debuglog('got kernel menu button');

    sel = "button[id='Kernel']";
    await page.waitForSelector(sel, {visible: true})
    await page.click(sel);
    debuglog('clicked Kernel button');

    let linkHandlers = await page.$x("//a[contains(., 'Restart and run all (do not stop on errors)...')]");
    await linkHandlers[0].click();
    debuglog("clicked Restart and run all no stop");

    linkHandlers = await page.$x("//button[contains(., 'Restart and run all')]");
    await linkHandlers[0].click();
    debuglog("clicked Restart and run all");

    // make sure restart happens
    // document.querySelector("[cocalc-test='jupyter-cell']").innerText
    // ==>
    // "In [ ]:↵%display latex↵sum(1/x^2,x,1,oo)↵3.476 seconds1"

    sel = "[cocalc-test='jupyter-cell']";
    const empty_exec_str: string = "In []:";
    const restart_max_tries = 300;
    let text: string = "XX";
    let step: number = 0;
    for (; step < restart_max_tries; step++) {
      text = await page.$eval(sel, function(e) {
        return ((<HTMLElement>e).innerText).toString()
      });
      if (step > 0 && step % 10 == 0) debuglog(step, ': readout: ', text.substr(0,40));
      if (text.startsWith(empty_exec_str)) break;
      await page.waitFor(100);
    }
    const enpfx:string = text.substr(0, empty_exec_str.length);
    debuglog('after ', step, 'tries, exec number starts with ', enpfx);
    expect(enpfx).to.equal(empty_exec_str);

    await page.$$('.myfrac');
    debuglog('got fraction in sage ipynb');

    sel = "button[title='Close and halt']";
    await page.click(sel);
    debuglog('clicked halt button');

    sel = '*[cocalc-test="search-input"][placeholder="Search or create file"]';
    await page.waitForSelector(sel);
    debuglog('got file search');

    time_log("sage ipynb test", tm_sage_ker_test);
    await screenshot(page, opts, 'cocalc-sage-ipynb.png');
    pfcounts.pass += 1;

  } catch (e) {
    pfcounts.fail += 1;
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
  return pfcounts;
}
