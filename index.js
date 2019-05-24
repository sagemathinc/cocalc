const HEADLESS = true;

const puppeteer = require('puppeteer');
const CREDS = require('./creds');

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
  
//  let urls = await page.evaluate(() => {
//                let results = [];
//                let items = document.querySelectorAll('input');
//                items.forEach((item) => {
//                    results.push({
//                        url:  item.getAttribute('placeholder'),
//                        text: item.innerText,
//                    });
//                });
//                return results;
//            })
//  console.log(urls);
//  console.log('xyzzy');
//  elt = null
//  while (!elt) {
//    elt = await page.evaluate(() => {
//      element = document.querySelector('[placeholder="Search for projects..."]');
//      return element;
//    });
//    console.log('wait')
//  }

//  console.log(elt);

  const n = 3;
  console.log(`wait ${n} seconds`);
  page.waitFor(n * 1000);
  
  await page.screenshot({ path: 'screenshots/cocalc.png'});
  browser.close();
}

run();
