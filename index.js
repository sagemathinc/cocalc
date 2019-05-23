const HEADLESS = false;

const puppeteer = require('puppeteer');
const CREDS = require('./creds');

async function run() {
  const browser = await puppeteer.launch({
    headless: HEADLESS,
  });

  const context = await browser.createIncognitoBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1024, height: 768});

  // sign in
  await page.goto(CREDS.url);
  console.log('01 got sign-in page')

  const USERNAME_SELECTOR = '#smc-react-container > div > div:nth-child(4) > div > div > div.hidden-xs.row > div:nth-child(1) > form > div > div:nth-child(1) > div.col-xs-5 > div > input'
  const PASSWORD_SELECTOR = '#smc-react-container > div > div:nth-child(4) > div > div > div.hidden-xs.row > div:nth-child(1) > form > div > div:nth-child(1) > div.col-xs-4 > div > input'
  const BUTTON_SELECTOR = '#smc-react-container > div > div:nth-child(4) > div > div > div.hidden-xs.row > div:nth-child(1) > form > div > div:nth-child(1) > div.col-xs-3 > button'

  await page.click(USERNAME_SELECTOR);
  await page.keyboard.type(CREDS.username);

  await page.click(PASSWORD_SELECTOR);
  await page.keyboard.type(CREDS.password);

  await page.click(BUTTON_SELECTOR);
  await page.waitForNavigation();
  console.log('02 signed in')

  // search for test project
  const PROJECT_SELECTOR = '#smc-react-container > div > div.container-content > div > div > div:nth-child(2) > div.col-sm-4 > div > span > input'

  await page.waitForSelector(PROJECT_SELECTOR);
  await page.click(PROJECT_SELECTOR);
  await page.keyboard.type(CREDS.project);
  console.log('03 got project selector')
  
  // select test project
  const TEST_PROJECT_SELECTOR = '#smc-react-container > div > div.container-content > div > div > div:nth-child(5) > div > div > div > div > div:nth-child(1) > a > span > p'
  await page.waitForSelector(TEST_PROJECT_SELECTOR);
  await page.click(TEST_PROJECT_SELECTOR);
  console.log('04 selected test project')
  
  // search for test file
  const FILE_SELECTOR = '#smc-react-container > div > div.smc-vfill > div > div:nth-child(5) > div > div:nth-child(2) > div:nth-child(1) > span > div.form-group > span > input'
  await page.waitForSelector(FILE_SELECTOR);
  await page.click(FILE_SELECTOR);
  await page.keyboard.type(CREDS.texfile);
  console.log('05 got file selector')

  // select test file
  const TEST_FILE_SELECTOR = '#smc-react-container > div > div.smc-vfill > div > div:nth-child(5) > div > div:nth-child(4) > div.col-sm-12 > div:nth-child(2) > div:nth-child(1) > div > div > div > div > div.col-sm-5.col-sm-pull-4.col-xs-12 > a'
  await page.waitForSelector(TEST_FILE_SELECTOR);
  await page.click(TEST_FILE_SELECTOR);
  console.log('06 selected latex test file')
  
  // wait for latex build button
  const BUILD_BUTTON_SELECTOR = '#titlebar-fb0b9f0c > div:nth-child(2) > div > button:nth-child(3)'
  await page.waitForSelector(BUILD_BUTTON_SELECTOR);
  console.log('07 got build button')
  
  // await page.waitFor(5 * 1000);

  browser.close();
}

run();
