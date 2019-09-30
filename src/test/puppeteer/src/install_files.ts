// given email address, password, and project name in creds file,
// copy front-end test files to home directory of the project

const path = require('path');
const this_file:string = path.basename(__filename, '.js');
const debuglog = require('util').debuglog('cc-' + this_file);

const program = require('commander');
import chalk     from 'chalk';
import * as fs   from 'fs';
import * as yaml from 'js-yaml';
import { Creds, Opts, InstallOpts, PassFail, ApiGetString, TestFiles } from './types';
import { time_log, num_log } from './time_log';
import { get_api_key } from './get_api_key';
import { api_create_file } from './api_create_file';
import get_project_id from './get_project_id';

// provide program version for "-V" | "--version" arg
program.version('1.0.0');

const cli_parse = function() {
  try {
    // command line processing
    // -p option without arg uses the following path
    const ext_chrome_path: string = '/usr/bin/chromium-browser';
    program
      .option('-c, --creds <file>', 'credentials file', "./creds")
      .option('-H, --no-headless', 'show browser (requires X11)', false)
      .option('-s, --screenshot', 'take screenshots', false)
      .option('-p, --path-to-chrome [chromepath]')
      .option('-i, --install-path <folder>', 'path to files to upload', "data")
      .parse(process.argv);
    let creds_file: string = program.creds;
    debuglog('creds file:', creds_file);
    let creds: Creds = yaml.safeLoad(fs.readFileSync(creds_file, 'utf8'));
    let cpath: string;
    if (program.pathToChrome == true) {
      cpath = ext_chrome_path;
    } else {
      cpath = program.pathToChrome;
    }
    const iopts: InstallOpts = {
      headless: program.headless,
      screenshot: program.screenshot,
      path: cpath,
      skip: undefined,
      install_folder: program.installPath
    }
    debuglog("iopts", iopts);
    debuglog('site:', creds.sitename);
    return ({c: creds, o: iopts});
  } catch (e) {
    console.log(chalk.red(`ERROR: ${e.message}`));
    process.exit();
    return undefined; // not reached, added for tsc
  }
}

const install_api_session = async function (creds: Creds, iopts: InstallOpts): Promise<PassFail> {
  let pfcounts: PassFail = new PassFail();
  const opts: Opts = iopts;
  try {
    const tm_start = process.hrtime.bigint()

    let ags: ApiGetString = await get_api_key(creds, opts);
    const api_key = ags.result;
    pfcounts.add(ags);
    debuglog('api_key', api_key.substr(0,7)+"...");

    ags = await get_project_id(creds, opts, api_key);
    const project_id: string = ags.result;
    pfcounts.add(ags);
    debuglog('project_id', project_id.substr(0,7)+"...");

    // iterate over test files
    for (let key in TestFiles) {
      const file_name: string = TestFiles[key];
      let file_path: string = path.join(iopts.install_folder, file_name);
      let text: string = fs.readFileSync(file_path, 'utf8');
      pfcounts.add(await api_create_file(creds, file_name, api_key, project_id, text));
    }

    // for writing text file
    // project_id: id of project where file is created (required)
    // path: path to file, relative to home directory in destination project (required)
    // content: contents of the text file to be written (required)
    time_log(this_file, tm_start);

  } catch (e) {
    pfcounts.fail += 1;
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
  debuglog(this_file + ' get_key done');
  return pfcounts;
}

const run_tests = async function() {
  // as of 2019-09-27, axios POST to CoCalc docker API fails
  // with "certificate has expired"
  // UNLESS the following setting is used
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const cp = cli_parse();
  let pfcounts: PassFail = new PassFail();
  if (cp){
    let x: PassFail = await install_api_session(cp.c, cp.o);
    pfcounts.add(x);
  }
  num_log("files written", Math.max(0, pfcounts.pass - 2));
}

run_tests();

