const debuglog = require('util').debuglog('cc-login');
const puppeteer = require('puppeteer');
import chalk from 'chalk';
import Creds     from './test-creds';
import time_log from './time_log';
import test_tex from './test_tex';
import test_widget from './test_widget';
import test_sage_ker from './test_sage_ker';
import { Page } from 'puppeteer';

const LONG_TIMEOUT = 70000; // msec

const login_tests = async function (creds: Creds): Promise<void> {
  let browser;
  try {
    const tm_launch_browser = process.hrtime.bigint()
    browser = await puppeteer.launch({
      ignoreHTTPSErrors:true,
      headless: creds.headless,
      executablePath: creds.path,
      slowMo:50 // without this sometimes the wrong project is selected
      })

    const page: Page = (await browser.pages())[0];
    //var Type = require('type-of-is');
    //console.log(Type.string(page));
    const version: string = await page.browser().version();
    debuglog('browser', version);

    time_log("launch browser", tm_launch_browser);
    const tm_login = process.hrtime.bigint()
    await page.setDefaultTimeout(LONG_TIMEOUT);

    // use large viewport for .tex test until this issue is fixed:
    // https://github.com/sagemathinc/cocalc/issues/4000
    //await page.setViewport({ width: 1280, height: 1024});
    //await page.setViewport({ width: 1024, height: 768});
    //await page.setViewport({ width: 800, height: 600});

    await page.goto(creds.url)
    debuglog('loaded', creds.url);

    let sel = '*[cocalc-test="sign-in-email"]';
    await page.click(sel);
    await page.keyboard.type(creds.email);
    debuglog('entered email', creds.email);

    sel = '*[cocalc-test="sign-in-password"]';
    await page.click(sel);
    await page.keyboard.type(creds.passw);
    debuglog('entered password');

    sel = '*[cocalc-test="sign-in-submit"]';
    await page.click(sel);
    time_log("login", tm_login);

    const tm_open_project = process.hrtime.bigint()
    sel = '*[cocalc-test="project-button"]';
    await page.waitForSelector(sel);
    await page.click(sel);

    // type into the project search blank
    sel = '*[cocalc-test="search-input"][placeholder="Search for projects..."]';
    await page.waitForSelector(sel);
    await page.type(sel, creds.project);

    // find the project link and click it
    let xpt = `//a[@cocalc-test="project-line"][//span/p[text()="${creds.project}"]]`;
    //await page.waitForXPath(xpt, timeout=LONG_TIMEOUT);
    await page.waitForXPath(xpt);
    sel = '*[cocalc-test="project-line"]';
    await page.click(sel);

    xpt = '//button[text()="Check All"]';
    await page.waitForXPath(xpt);
    time_log("open project", tm_open_project);

    if (true) await test_tex(creds, page);
    if (true) await test_widget(creds, page);
    await test_sage_ker(creds, page);

    time_log("login session total", tm_launch_browser);
  } catch (e) {
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
  debuglog('login session done - closing browser');
  browser.close();
}

module.exports = {login_tests}