const HEADLESS = true;

const puppeteer = require('puppeteer');
const CREDS = require('./creds');
const sprintf = require('sprintf-js').sprintf;

async function run() {
  const browser = await puppeteer.launch({
    headless: HEADLESS,
  });

  //const context = await browser.createIncognitoBrowserContext();
  //const page = await context.newPage();
  const page = (await browser.pages())[0];
  // await page.setViewport({ width: 1024, height: 768});

  // sign in
  await page.goto(CREDS.url);
  console.log('01 got sign-in page')

  // get selectors manually by doing Inspect while viewing page in chrome
  const USERNAME_SELECTOR = '#smc-react-container > div > div:nth-child(4) > div > div > div.hidden-xs.row > div:nth-child(1) > form > div > div:nth-child(1) > div.col-xs-5 > div > input'
  const PASSWORD_SELECTOR = '#smc-react-container > div > div:nth-child(4) > div > div > div.hidden-xs.row > div:nth-child(1) > form > div > div:nth-child(1) > div.col-xs-4 > div > input'
  const BUTTON_SELECTOR = '#smc-react-container > div > div:nth-child(4) > div > div > div.hidden-xs.row > div:nth-child(1) > form > div > div:nth-child(1) > div.col-xs-3 > button'

  await page.click(USERNAME_SELECTOR);
  await page.keyboard.type(CREDS.username);

  await page.click(PASSWORD_SELECTOR);
  await page.keyboard.type(CREDS.password);

  await page.click(BUTTON_SELECTOR);
  await page.waitForNavigation({'waitUntil':'networkidle0'});
  console.log('02 signed in')

  //const n = 3;
  //console.log(`wait ${n} seconds`);
  //page.waitFor(n * 1000);
  
  // unique attribute for many CoCalc inputs is the placeholder string
  // here is the selector for project search
  // input[placeholder="Search for projects..."]
  sfpPh="Search for projects...";
  sfpSel = sprintf('input[placeholder=\"%s\"]', sfpPh);

  // pass function definition as string to page.waitForFunction
  // x will be this:
  // document.querySelector('input[placeholder="Search for projects..."]').placeholder == "Search for projects..."
  x = sprintf("document.querySelector(\'%s\').placeholder == \"%s\"", sfpSel, sfpPh);
  await page.waitForFunction(x);
  console.log('03 got search for projects input element')
  
  // type into the project search blank
  await page.type(sfpSel, CREDS.project);
  
try {
  // find the project link and click it
  const linkHandlers = await page.$x(`//a/span/p[text()='${CREDS.project}']`);

  console.log('04 number of links matching test project name',linkHandlers.length)
  if (linkHandlers.length > 0) {
    await linkHandlers[0].click();
  } else {
    throw new Error("Link not found");
  }

  //await page.waitFor(3 * 1000);
  const spath = 'screenshots/cocalc.png';
  await page.screenshot({ path: spath});
  console.log(`05 screenshot saved to ${spath}`);
} catch (e) {
  console.log('05 ERROR',e.message);
}
  browser.close();
}

run();
