const debuglog = require('util').debuglog('cc-api');
const puppeteer = require('puppeteer');
import chalk from 'chalk';
import Creds     from './test-creds';
import time_log from './time_log';
import { expect } from 'chai';
import test_user_search from './test_user_search';
import test_user_auth from './test_user_auth';

const LONG_TIMEOUT = 70000; // msec

const api_session = async function (creds: Creds): Promise<void> {
  let browser;
  try {
    const tm_launch_browser = process.hrtime.bigint()
    browser = await puppeteer.launch({
      ignoreHTTPSErrors:true,
      headless: creds.headless,
      executablePath: creds.path,
      slowMo:50 // without this sometimes the wrong project is selected
      })

    const page = (await browser.pages())[0];
    const version: string = await page.browser().version();
    debuglog('browser', version);

    time_log("launch browser for api key", tm_launch_browser);
    const tm_login = process.hrtime.bigint()
    await page.setDefaultTimeout(LONG_TIMEOUT);

    const url: string = creds.url + '?get_api_key=docs';
    await page.goto(url);
    debuglog('got url', url);

    let sel = '*[cocalc-test="sign-in-email"]';
    await page.click(sel);
    await page.keyboard.type(creds.email);
    debuglog('entered email', creds.email);

    sel = '*[cocalc-test="sign-in-password"]';
    await page.click(sel);
    await page.keyboard.type(creds.passw);
    debuglog('entered password');

    await page.setRequestInterception(true);

    sel = '*[cocalc-test="sign-in-submit"]';
    await page.click(sel);
    debuglog('clicked submit');
    time_log("login", tm_login);

    // intercepted url looks like https://authenticated/?api_key=sk_hJKSJax....
    const api_key:string = await new Promise<string>(function(resolve) {
      page.on('request', async function(request: any) {
        const regex: RegExp = /.*=/;
        const u: string = await request.url();
        if (/authenticated/.test(u)) {
          request.continue();
          const result: string = u.replace(regex, '');
          resolve(result);
        }
      });
    });
    debuglog('api_key', api_key.substr(0,5)+"...");
    expect(api_key.substr(0,3)).to.equal("sk_");
    await page.setRequestInterception(false);

    const account_id: string = await test_user_search(creds, api_key);
    expect(account_id.length).to.equal(36);

    const auth_token: string = await test_user_auth(creds, api_key, account_id);
    debuglog('auth_token', auth_token.substr(0,5)+"...");

    time_log("api session total", tm_launch_browser);

  } catch (e) {
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
  debuglog('api tests done - closing browser');
  browser.close();
}

module.exports = {api_session}