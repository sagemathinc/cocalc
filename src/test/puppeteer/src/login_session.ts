const path = require("path");
const this_file: string = path.basename(__filename, ".js");
const debuglog = require("util").debuglog("cc-" + this_file);

const puppeteer = require("puppeteer");
import chalk from "chalk";
import { Creds, Opts, PassFail } from "./types";
import { time_log } from "./time_log";
import { test_tex } from "./test_tex";
import { test_widget } from "./test_widget";
import { test_sage_ker } from "./test_sage_ker";
import { test_sagews } from "./test_sagews";
import { del_hide_project } from "./del_hide_project";
import { Page } from "puppeteer";

const LONG_TIMEOUT = 70000; // msec

export const login_tests = async function(
  creds: Creds,
  opts: Opts
): Promise<PassFail> {
  let browser;
  const pfcounts: PassFail = new PassFail();
  if (opts.skip && opts.skip.test(this_file)) {
    debuglog("skipping test: " + this_file);
    pfcounts.skip += 1;
    return pfcounts;
  }
  try {
    const tm_launch_browser = process.hrtime.bigint();
    browser = await puppeteer.launch({
      ignoreHTTPSErrors: true,
      headless: opts.headless,
      executablePath: opts.path,
      slowMo: 50 // without this sometimes the wrong project is selected
    });

    const page: Page = (await browser.pages())[0];
    //var Type = require('type-of-is');
    //console.log(Type.string(page));
    const version: string = await page.browser().version();
    debuglog("browser", version);

    time_log("launch browser", tm_launch_browser);
    const tm_login = process.hrtime.bigint();
    await page.setDefaultTimeout(LONG_TIMEOUT);

    // use large viewport for .tex test until this issue is fixed:
    // https://github.com/sagemathinc/cocalc/issues/4000
    //await page.setViewport({ width: 1280, height: 1024});
    // workaround for sagews, Run button doesn't show if window is narrower than 1000 px or so
    await page.setViewport({ width: 1024, height: 768});
    //await page.setViewport({ width: 800, height: 600});

    await page.goto(creds.url);
    debuglog("loaded", creds.url);

    let sel = '*[cocalc-test="sign-in-email"]';
    await page.click(sel);
    await page.keyboard.type(creds.email);
    debuglog("entered email", creds.email);

    sel = '*[cocalc-test="sign-in-password"]';
    await page.click(sel);
    await page.keyboard.type(creds.passw);
    debuglog("entered password");

    sel = '*[cocalc-test="sign-in-submit"]';
    await page.click(sel);
    time_log("login", tm_login);

    const tm_open_project = process.hrtime.bigint();
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
    pfcounts.pass += 1;

    if (opts.xprj) pfcounts.add(await del_hide_project(opts, page));
    if (opts.xprj === undefined || opts.xprj !== "delete") {
      pfcounts.add(await test_tex(opts, page));
      pfcounts.add(await test_widget(opts, page));
      pfcounts.add(await test_sage_ker(opts, page));
      pfcounts.add(await test_sagews(opts, page));
    }

    time_log("login session total", tm_launch_browser);
  } catch (e) {
    pfcounts.fail += 1;
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
  debuglog("login session done - closing browser");
  browser.close();
  return pfcounts;
};
