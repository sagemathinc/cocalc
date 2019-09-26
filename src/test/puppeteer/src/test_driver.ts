// top-level front end test driver
// npm run build
// npm run test -- [-H] -c ~/CCTEST/cocalc.yaml

// TODO - split CREDS and ARGS
// TODO - report number of tests passed, failed, and skipped

const debuglog = require('util').debuglog('cc-driver');
const program = require('commander');
import chalk     from 'chalk';
import * as fs   from 'fs';
import * as yaml from 'js-yaml';
import Creds     from './test-creds';

const {login_tests} = require('./login_session');
const {api_session} = require('./api_session');

// provide program version for "-V" | "--version" arg
program.version('1.0.0');

const cli_parse = function(): Creds|undefined {
  try {
    // command line processing
    // -p option without arg uses the following path
    const ext_chrome_path: string = '/usr/bin/chromium-browser';
    program
      .option('-c, --creds <file>', 'credentials file', "./creds")
      .option('-H, --no-headless', 'show browser (requires X11)', false)
      .option('-s, --screenshot', 'take screenshots', false)
      .option('-p, --path-to-chrome [chromepath]>')
      .parse(process.argv);
    let creds_file = program.creds;
    //if (!creds_file.includes("/")) {creds_file = "./" + creds_file;}
    debuglog('creds file:', creds_file);
    //let creds = require(creds_file);
    let creds: Creds = yaml.safeLoad(fs.readFileSync(creds_file, 'utf8'));
    creds.headless   = program.headless;
    creds.screenshot = program.screenshot;
    if (program.pathToChrome == true) {
      creds.path = ext_chrome_path;
    } else {
      creds.path = program.pathToChrome;
    }
    debuglog('site:', creds.sitename);
    debuglog('headless:',creds.headless);
    if (creds.path) debuglog('chrome path:',creds.path);
    return creds;
  } catch (e) {
    console.log(chalk.red(`ERROR: ${e.message}`));
    process.exit();
    return undefined;
  }
}

//const browser = await puppeteer.launch({executablePath: '/path/to/Chrome'});
//cocalc: /usr/bin/chromium-browser

const run_tests = async function() {
  const creds: Creds|undefined = cli_parse();
  if (creds){
    // edit 'true' to 'false' to skip tests
    if (true) await login_tests(creds);
    if (true) await api_session(creds);
  }
}

run_tests();

