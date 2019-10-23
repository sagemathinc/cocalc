// top-level front end test driver

const path = require('path');
const this_file:string = path.basename(__filename, '.js');
const debuglog = require('util').debuglog('cc-' + this_file);

const program = require('commander');
import chalk     from 'chalk';
import * as fs   from 'fs';
import * as yaml from 'js-yaml';
import { Creds, Opts, ExtChromePath, PassFail } from './types';
import { pf_log } from './time_log';

import { login_tests } from './login_session';
import { api_session } from './api_session';
import { expect } from 'chai';

// provide program version for "-V" | "--version" arg
program.version('1.0.0');

const cli_parse = function() {
  try {
    // command line processing
    // -p option without arg uses the following path
    program
      .option('-c, --creds <file>', 'credentials file', "./creds")
      .option('-H, --no-headless', 'show browser (requires X11)', false)
      .option('-s, --screenshot', 'take screenshots', false)
      .option('-p, --path-to-chrome [chromepath]')
      .option('-k, --skip <pattern>', 'skip tests matching pattern')
      .option('-x, --xprj <cmd>', 'delete|undelete|hide|unhide project')
      .parse(process.argv);
    let creds_file = program.creds;
    //if (!creds_file.includes("/")) {creds_file = "./" + creds_file;}
    debuglog('creds file:', creds_file);
    //let creds = require(creds_file);
    let creds: Creds = yaml.safeLoad(fs.readFileSync(creds_file, 'utf8'));
    let cpath: string;
    if (program.pathToChrome == true) {
      cpath = ExtChromePath;
    } else {
      cpath = program.pathToChrome;
    }
    let skip: RegExp|undefined = undefined;
    if (program.skip) skip = new RegExp(program.skip);
    if (program.xprj) expect(['delete','undelete','hide','unhide'], 'bad xprj value').to.include(program.xprj);
    const opts: Opts = {
      headless: program.headless,
      screenshot: program.screenshot,
      xprj: program.xprj,
      path: cpath,
      skip: skip,
    }
    debuglog("opts", opts);
    debuglog('site:', creds.sitename);
    return ({c: creds, o: opts});
  } catch (e) {
    console.log(chalk.red(`ERROR: ${e.message}`));
    process.exit();
    return undefined; // not reached, added for tsc
  }
}

const run_tests = async function() {
  // as of 2019-09-27, axios POST to CoCalc docker API fails
  // with "certificate has expired"
  // UNLESS the following setting is used
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const cp = cli_parse();
  let pfcounts: PassFail = new PassFail();
  if (cp){
    let x: PassFail = await login_tests(cp.c, cp.o);
    pfcounts.add(x);
    // skip api tests if project was just deleted
    if ((cp.o.xprj === undefined) || (cp.o.xprj !== "delete")) {
      x = await api_session(cp.c, cp.o);
      pfcounts.add(x);
    }
  }
  pf_log(pfcounts);
}

run_tests();

