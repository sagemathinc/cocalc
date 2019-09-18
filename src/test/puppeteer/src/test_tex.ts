const debuglog = require('util').debuglog('cc-login-tex');
import chalk from 'chalk';
import Creds     from './test-creds';
import time_log from './time_log';
import screenshot from './screenshot';
import { Page } from 'puppeteer';

import { expect } from 'chai';

const test_tex = async function (creds: Creds, page: Page): Promise<void> {
  try {
    const tm_open_tex = process.hrtime.bigint()

    // click the Files button
    let sel = '*[cocalc-test="Files"]';
    await page.click(sel);
    debuglog('clicked Files');

    sel = '*[cocalc-test="search-input"][placeholder="Search or create file"]';
    await page.click(sel);
    await page.type(sel, creds.texfile);
    debuglog(`entered ${creds.texfile} into file search`);

    // find and click the texfile link
    // split texfile name into base and ext because they appear in separate spans
    const z = creds.texfile.lastIndexOf(".");
    const tfbase = creds.texfile.slice(0,z);
    const tfext  = creds.texfile.slice(z);

    let xpt = `//a[@cocalc-test="file-line"][//span[text()="${tfbase}"]][//span[text()="${tfext}"]]`;
    //await page.waitForXPath(xpt, {timeout: 50000});
    await page.waitForXPath(xpt);
    sel = '*[cocalc-test="file-line"]';
    await page.click(sel);
    debuglog('clicked file line');

    // sel = 'button[title="Show only this frame"]';
    // await page.click(sel);
    // debuglog('clicked show only source frame');

    time_log("open tex file", tm_open_tex);
    const tm_word_count = process.hrtime.bigint()

    sel = '*[cocalc-test="latex-dropdown"]';
    await page.waitForSelector(sel);
    await page.click(sel);
    debuglog('clicked latex dropdown');

    sel = '*[cocalc-test="word_count"]';
    await page.click(sel);
    debuglog('clicked word count');

    xpt = '//div[contains(text(), "Encoding: ascii")]';
    await page.waitForXPath(xpt);
    debuglog('got encoding ascii');

    sel = '*[cocalc-test="word-count-output"]';
    await page.waitForSelector(sel);

    const text: string = await page.$eval(sel, function(e) {
      return ((<HTMLElement>e).innerText).toString()
    });
    const want: string = "Words in headers: 3";
    debuglog('word count output:\n'+ chalk.cyan(text));
    expect(text, 'missing text in word count output').to.include(want);

    sel = '*[cocalc-test="latex-dropdown"]';
    await page.waitForSelector(sel);
    await page.click(sel);
    debuglog('clicked latex dropdown again');

    sel = '*[cocalc-test="cm"]';
    await page.click(sel);
    debuglog('clicked source code');

    sel = '*[title="Build project"]';
    await page.waitForSelector(sel);
    debuglog('got Build project button');

    sel = `[cocalc-test="${creds.texfile}"] [data-icon="times"]`;
    //await page.waitForSelector(sel);
    await page.click(sel);
    debuglog('clicked close file tab icon');

    time_log("word count tex file", tm_word_count);
    await screenshot(page, creds, 'cocalc-tex.png');

  } catch (e) {
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
}

export default test_tex;
