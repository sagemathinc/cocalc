// get api_key
// usage:
//   node api_key.js [-s] [-c credentials-file]
// -s - display the browser window (opposite of headless), default false
// -c - name of credentials file, without ".js" extension
//
// example invocations
//   node api_key.js creds-cocalc // run test headless with 'creds-cocalc.js' credentials file

const HEADLESS = true;

const puppeteer = require('puppeteer');
const chalk = require('chalk');
const program = require('commander');

async function run() {
  try {

    program
      .option('-s, --screen', 'opposite of headless')
      .option('-c, --creds <file>', 'credentials file', "./creds")


    program.parse(process.argv);

    headless = !(program.screen);
    console.log('headless',headless);

    creds = program.creds;
    if (!creds.includes("/")) {creds = "./" + creds;}
    console.log('creds file:', creds);

    //throw new Error("early exit");

    let browser;
    if (headless) {
      browser = await puppeteer.launch({
      ignoreHTTPSErrors:true,
      })
    } else {
      browser = await puppeteer.launch({
        headless: false,
        ignoreHTTPSErrors:true,
        sloMo:200
      })
    }

    const CREDS = require(creds);

    const page = (await browser.pages())[0];

    await page.setRequestInterception(true);
    page.on('request', request => {
      if (/authenticated/.test(request.url())) {
        console.log(request.url())
      }
      request.continue();
    });

    // sign in
    url = CREDS.url + '?get_api_key=docs';
    await page.goto(url);
    console.log('01 got sign-in page', CREDS.url);

    // get selectors manually by doing Inspect while viewing page in chrome
    const emailSel = '#smc-react-container > div > div > div > div > div:nth-child(3) > div.hidden-xs.row > div:nth-child(1) > form > div > div:nth-child(1) > div.col-xs-5 > div > input'
    const pwSel = '#smc-react-container > div > div > div > div > div:nth-child(3) > div.hidden-xs.row > div:nth-child(1) > form > div > div:nth-child(1) > div.col-xs-4 > div > input'
    const btnSel = '#smc-react-container > div > div > div > div > div:nth-child(3) > div.hidden-xs.row > div:nth-child(1) > form > div > div:nth-child(1) > div.col-xs-3 > button'

    await page.click(emailSel);
    await page.keyboard.type(CREDS.username);

    await page.click(pwSel);
    await page.keyboard.type(CREDS.password);

    await page.click(btnSel);
    await page.waitForNavigation({'waitUntil':'networkidle0'});
    console.log('02 signed in');
    await page.waitFor(4 * 1000);

    console.log('99 all tests ok - closing browser');
    browser.close();

  } catch (e) {
    console.log('98 ERROR',e.message);
    process.exit()
  }
}

run();

