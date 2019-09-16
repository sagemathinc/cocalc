// front end test of CoCalc in puppeteer
// usage:
//   npm run test -- [-s] [-c credentials-file]
// or
//   node index.js [-s] [-c credentials-file]
// -s - display the browser window (opposite of headless), default false
// -c - name of credentials file, without ".js" extension
//
// example invocations
//   npm run test -- -s  // run the test with 'creds.js', not headless
//   node index.js creds-cocalc // run test headless with 'creds-cocalc.js' credentials file
//
// example credentials file "creds.js"
//
// module.exports = {
//     url: 'https://cocalcinstance.com/app',
//     username: 'testuser@example.com',
//     password: 'asdf8qwerty',
//     project:  'my-test',
//     texfile:  'latex-fu.tex'
// }

// to do:
// - write in typescript?
// - host on gce
// - deal gracefully with test project that is stopped/archived

// works with:
// - cocalc.com
// - test.cocalc.com
// - docker containers
//   - UW regular cocalc
//   - UW no-agpl cocalc
//   - pixelbook cocalc
//   - pixelbook no-agpl cocalc

const HEADLESS = true;

const puppeteer = require('puppeteer');
const chalk = require('chalk');
const program = require('commander');
program.version('0.1.0');


const sprintf = require('sprintf-js').sprintf;

const LONG_TIMEOUT = 70000; // msec

async function run() {
  try {
    let xpt;

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
    //await page.waitFor(2 * 1000);

    let browser;
    if (headless) {
      browser = await puppeteer.launch({
        ignoreHTTPSErrors:true,
        slowMo:50 // without this sometimes wrong project is selected
      })
    } else {
      browser = await puppeteer.launch({
        headless: false,
        ignoreHTTPSErrors:true,
        slowMo:50
      })
    }

    const CREDS = require(creds);

    //const context = await browser.createIncognitoBrowserContext();
    //const page = await context.newPage();
    const page = (await browser.pages())[0];
    const version = await page.browser().version();
    console.log('version', version);
    await page.setDefaultTimeout(60000);
    // await page.setViewport({ width: 1024, height: 768});

    // sign in
    var hrstart = process.hrtime()
    await page.goto(CREDS.url)
    var hrend = process.hrtime(hrstart)
    console.log('got sign-in page', CREDS.url);
    console.log('Execution time: %ds %dms', hrend[0], hrend[1] / 1000000)

    let sel = '*[cocalc-test="sign-in-email"]';
    await page.click(sel);
    await page.keyboard.type(CREDS.username);
    console.log('entered email address');

    sel = '*[cocalc-test="sign-in-password"]';
    await page.click(sel);
    await page.keyboard.type(CREDS.password);
    console.log('entered password');

    sel = '*[cocalc-test="sign-in-submit"]';
    await page.click(sel);
    console.log('clicked submit');

    sel = '*[cocalc-test="project-button"]';
    await page.waitForSelector(sel);
    await page.click(sel);
    console.log('clicked project button');

    // type into the project search blank
    sel = '*[cocalc-test="search-input"][placeholder="Search for projects..."]';
    await page.waitForSelector(sel);
    await page.type(sel, CREDS.project);
    console.log('entered test project name');


    // find the project link and click it
    // XXX if multiple projects match the test project name, choose the first one
    // use xpath to make sure the right project line is rendered
    // then use css selector to click it because you can't click an xpath
    xpt = `//a[@cocalc-test="project-line"][//span/p[text()="${CREDS.project}"]]`;
    await page.waitForXPath(xpt, timeout=LONG_TIMEOUT);
    sel = '*[cocalc-test="project-line"]';
    await page.click(sel);
    console.log('clicked test project line');

    xpt = '//button[text()="Check All"]';
    await page.waitForXPath(xpt);
    console.log('got check all');

    // click the Files button
    sel = '*[cocalc-test="Files"]';
    await page.click(sel);
    console.log('clicked Files');

    sel = '*[cocalc-test="search-input"][placeholder="Search or create file"]';
    await page.click(sel);
    await page.type(sel, CREDS.texfile);
    console.log('entered texfile name into file search');

    // find and click the texfile link
    // split texfile name into base and ext because they appear in separate spans
    const z = CREDS.texfile.lastIndexOf(".");
    const tfbase = CREDS.texfile.slice(0,z);
    const tfext  = CREDS.texfile.slice(z);

    xpt = `//a[@cocalc-test="file-line"][//span[text()="${tfbase}"]][//span[text()="${tfext}"]]`;
    //await page.waitForXPath(xpt, timeout=LONG_TIMEOUT);
    await page.waitForXPath(xpt, timeout=5000);
    sel = '*[cocalc-test="file-line"]';
    await page.click(sel);
    console.log('clicked file line');

    sel = '*[cocalc-test="latex-dropdown"]';
    await page.waitForSelector(sel);
    await page.click(sel);
    console.log('clicked latex dropdown');

    const spath = 'cocalc.png';
    await page.screenshot({ path: spath});
    console.log(`screenshot saved to ${spath}`);

    sel = '*[cocalc-test="word_count"]';
    await page.click(sel);
    console.log('clicked word count');

    xpt = '//div[contains(text(), "Encoding: ascii")]';
    await page.waitForXPath(xpt);
    console.log('got encoding ascii');

    sel = '*[cocalc-test="word-count-output"]';
    const elt = await page.waitForSelector(sel);
    console.log('got word count output');

    text = await page.$eval(sel, e => e.innerText);
    console.log('word count output:\n'+ chalk.cyan(text));

    sel = '*[cocalc-test="latex-dropdown"]';
    await page.waitForSelector(sel);
    await page.click(sel);
    console.log('clicked latex dropdown again');

    sel = '*[cocalc-test="cm"]';
    await page.click(sel);
    console.log('clicked source code');

    sel = '*[title="Build project"]';
    await page.waitForSelector(sel);
    console.log('got build button');

    // XXX
    console.log('all tests ok - closing browser');
    browser.close();

  } catch (e) {
    console.log(chalk.red(`ERROR: ${e.message}`));
    process.exit()
  }
}

run();

