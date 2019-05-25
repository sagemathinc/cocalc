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
  const sfpx = sprintf("document.querySelector(\'%s\').placeholder == \"%s\"", sfpSel, sfpPh);
  await page.waitForFunction(sfpx);
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
  await page.waitForNavigation({'waitUntil':'networkidle0'});

  // find texfile link and click it
  sfilePh="Search or create file";
  sfileSel = sprintf('input[placeholder=\"%s\"]', sfilePh);

  const sfilex = sprintf("document.querySelector(\'%s\').placeholder == \"%s\"", sfileSel, sfilePh);
  await page.waitForFunction(sfilex);
  console.log('05 got file search input element')

  // type into the file search blank
  await page.type(sfileSel, CREDS.texfile);
  await page.waitForFunction(sfilex);

  // find and click the texfile link
  //const linkHandlers2 = await page.$x(`//a/span[text()='latex-sample']`);
  const linkHandlers2 = await page.$x(`//a/span[text()='${CREDS.texfile.slice(0,-4)}']`);
  console.log('06 number of links matching test texfile name',linkHandlers2.length)
  if (linkHandlers2.length > 0) {
    await Promise.all([
      linkHandlers2[0].click(),
      page.waitForNavigation({'waitUntil':'networkidle0'})
    ]);
    await page.waitFor(3 * 1000);
  } else {
    throw new Error("Link not found");
  }
  //await page.waitForNavigation({'waitUntil':'networkidle0'});

  // click the frame types pulldown
  // it displays "Source" in the uppler left frame initially
  // $x('//button[@id="types"]')[0].click();
//  const lh3 = await page.$x('//button[@id="types"]');
//  console.log('07 number of links matching types button',lh3.length)
//  if (lh3.length > 0) {
//    await lh3[0].click();
//  } else {
//    throw new Error("Link not found");
//  }
  await page.click("#types");
  console.log('07 clicked types menu');
  //await page.waitForNavigation({'waitUntil':'networkidle0'});
  
    const lh4 = await page.$x('//div[1]/div/ul/li[6]/a');
    console.log('08 number of links matching word count',lh4.length);
    if (lh4.length > 0) {
      await lh4[0].click();
      console.log('09 word count clicked');
    } else {
      throw new Error("Link not found");
    }

  
  
} catch (e) {
  console.log('08 ERROR',e.message);
}
  await page.waitFor(3 * 1000);
  const spath = 'screenshots/cocalc.png';
  await page.screenshot({ path: spath});
  console.log(`08 screenshot saved to ${spath}`);
  
  browser.close();
}

run();
