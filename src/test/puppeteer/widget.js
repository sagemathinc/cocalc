// jupyter widget test of CoCalc in puppeteer
//   node widget.js [-s] [-c credentials-file]
// -s - display the browser window (opposite of headless), default false
// -c - name of credentials file, without ".js" extension
//
// example invocations
//   node widget.js creds-cocalc // run test headless with 'creds-cocalc.js' credentials file
//

// TODO:
//   refactor - needs cleanup:
//   don't use hard-coded test file widget-sample.ipynb

const HEADLESS = true;

const puppeteer = require('puppeteer');
const chalk = require('chalk');
const program = require('commander');
program.version('0.1.0');

const path = require('path');
const wfname  = 'widgets-sample.ipynb';
const wfname0 = path.basename(wfname, '.ipynb');


const sprintf = require('sprintf-js').sprintf;

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
  await page.setViewport({ width: 1280, height: 800});

  // sign in
  await page.goto(CREDS.url);
  console.log('01 got sign-in page', CREDS.url);

  // get selectors manually by doing Inspect while viewing page in chrome
  const emailSel = '#smc-react-container > div > div:nth-child(4) > div > div > div.hidden-xs.row > div:nth-child(1) > form > div > div:nth-child(1) > div.col-xs-5 > div > input'
  const pwSel = '#smc-react-container > div > div:nth-child(4) > div > div > div.hidden-xs.row > div:nth-child(1) > form > div > div:nth-child(1) > div.col-xs-4 > div > input'
  const btnSel = '#smc-react-container > div > div:nth-child(4) > div > div > div.hidden-xs.row > div:nth-child(1) > form > div > div:nth-child(1) > div.col-xs-3 > button'

  await page.click(emailSel);
  await page.keyboard.type(CREDS.username);

  await page.click(pwSel);
  await page.keyboard.type(CREDS.password);

  await page.click(btnSel);
  await page.waitForNavigation({'waitUntil':'networkidle0'});
  console.log('02 signed in');
  await page.waitFor(2 * 1000);

  // selector for project search
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

  // find the project link and click it
  const lh1 = await page.$x(`//a/span/p[text()='${CREDS.project}']`);

  console.log(`04 number of links matching test project name ${CREDS.project} `,lh1.length);
  if (lh1.length == 1) {
    await lh1[0].click();
  } else {
    throw new Error("Link not found");
  }
  await page.waitForNavigation({'waitUntil':'networkidle0'});

  sfilePh="Search or create file";
  sfileSel = sprintf('input[placeholder=\"%s\"]', sfilePh);

  const sfilex = sprintf("document.querySelector(\'%s\').placeholder == \"%s\"", sfileSel, sfilePh);
  await page.waitForFunction(sfilex);
  console.log('05 got file search input element');

  // type into the file search blank
  await page.waitFor(2 * 1000);
  await page.type(sfileSel, wfname);
  await page.waitForFunction(sfilex);

  // find and click the file link
  const lh2 = await page.$x(`//a/span[text()='${wfname0}']`);
  console.log(`06 number of links matching test file basename ${wfname0}`,lh2.length);
  if (lh2.length == 1) {
    await Promise.all([
      lh2[0].click(),
      page.waitForNavigation({'waitUntil':'networkidle0'})
    ]);
    await page.waitFor(1 * 1000);
  } else {
    throw new Error("Link not found");
  }

  // find and click the notebook run button
  const runBtnXpath = "//button[@title='Run cells and select below']";
  const lhRunBtn = await page.$x(runBtnXpath);
  console.log(`07 number of links matching run button xpath ${runBtnXpath}`,lhRunBtn.length);
  if (lhRunBtn.length == 1) {
    await Promise.all([
      lhRunBtn[0].click(),
      //page.waitForNavigation({'waitUntil':'networkidle0'})
    ]);
    await page.waitFor(1 * 1000);
  } else {
    throw new Error("Link not found");
  }

  // readout of slider should be zero
  const readOut = await page.evaluate(() => {
    const ro = document.evaluate(
                 '//div[@class="widget-readout"]',
                 document,
                 null,
                 XPathResult.NUMBER_TYPE,
                 null
               ).numberValue;
      return ro;
    });

  console.log('readout', readOut);

  // find the slider bounding box
  // result is an object like this:
  // { x: 166, y: 288, width: 212, height: 28, top: 288, right: 378, bottom: 316, left: 166 }
  const box = await page.evaluate(() => {
    // Both selectors work for "sr". The second one has height of 4 pixels.
    //const sr = document.querySelector('div[class="slider-container"]').getBoundingClientRect().toJSON();
    const sr = document.querySelector('.ui-slider').getBoundingClientRect().toJSON();
      return sr;
    });
  console.log(`slider at (${box.left},${box.top}) to (${box.right},${box.bottom})`);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  //await page.mouse.move(100, 200); // move to (100, 200) coordinates
  await page.mouse.up();
  await page.waitFor(1 * 1000);
  console.log('clicked slider');

  // second readout of slider should be fifty
  const readOut2 = await page.evaluate(() => {
    const ro = document.evaluate(
                 '//div[@class="widget-readout"]',
                 document,
                 null,
                 XPathResult.NUMBER_TYPE,
                 null
               ).numberValue;
      return ro;
    });

  console.log('second readout', readOut2);

  // take screenshot before exiting
  const spath = 'cocalc.png';
  await page.screenshot({ path: spath});
  console.log(`98 screenshot saved to ${spath}`);

  console.log('99 all tests ok - closing browser');
  browser.close();

} catch (e) {
  console.log('98 ERROR',e.message);
  process.exit()
}
}

run();

