// given email address, password, and project name in creds file,
// copy front-end test files to home directory of the project

const path = require("path");
const this_file: string = path.basename(__filename, ".js");
const debuglog = require("util").debuglog("cc-" + this_file);

const program = require("commander");
import chalk from "chalk";
import * as fs from "fs";
import * as yaml from "js-yaml";
import {
  Creds,
  Opts,
  InstallOpts,
  ExtChromePath,
  PassFail,
  TestGetString,
  TestFiles
} from "./types";
import { time_log2, num_log } from "./time_log";
import { get_api_key } from "./get_api_key";
import { api_create_file } from "./api_create_file";
import { api_create_project } from "./api_create_project";
import { get_project_id } from "./get_project_id";

// provide program version for "-V" | "--version" arg
program.version("1.0.0");

const cli_parse = function() {
  try {
    // command line processing
    // -p option without arg uses the following path
    program
      .option("-c, --creds <file>", "credentials file", "./creds")
      .option("-H, --no-headless", "show browser (requires X11)", false)
      .option(
        "-i, --install-path <folder>",
        "path to files to upload",
        "test_files"
      )
      .option("-j, --create-project", "create project for tests")
      .option("-p, --path-to-chrome [chromepath]")
      .option("-m, --csv-log <file>", "timing log file", "./log.csv")
      .parse(process.argv);
    const creds_file: string = program.creds;
    debuglog("creds file:", creds_file);
    const creds: Creds = yaml.safeLoad(fs.readFileSync(creds_file, "utf8"));
    let cpath: string;
    if (program.pathToChrome == true) {
      cpath = ExtChromePath;
    } else {
      cpath = program.pathToChrome;
    }
    const iopts: InstallOpts = {
      install_folder: program.installPath,
      create_project: program.createProject,
      headless: program.headless,
      csv_log: program.csvLog,
      path: cpath
    };
    debuglog("iopts", iopts);
    debuglog("site:", creds.sitename);
    return { c: creds, o: iopts };
  } catch (e) {
    console.log(chalk.red(`ERROR: ${e.message}`));
    process.exit();
    return undefined; // not reached, added for tsc
  }
};

const install_api_session = async function(
  creds: Creds,
  iopts: InstallOpts
): Promise<PassFail> {
  const pfcounts: PassFail = new PassFail();
  try {
    const tm_start = process.hrtime.bigint();
    const opts: Opts = {
      headless: iopts.headless,
      csv_log: iopts.csv_log,
      path: iopts.path
    };
    let ags: TestGetString = await get_api_key(creds, opts);
    const api_key = ags.result;
    pfcounts.add(ags);
    debuglog("api_key", api_key.substr(0, 7) + "...");

    let project_id: string;
    if (iopts.create_project) {
      ags = await api_create_project(creds, opts, api_key);
    } else {
      ags = await get_project_id(creds, opts, api_key);
    }
    project_id = ags.result;
    pfcounts.add(ags);
    debuglog("project_id", project_id.substr(0, 7) + "...");

    // iterate over test files
    for (const key in TestFiles) {
      const file_name: string = TestFiles[key];
      const file_path: string = path.join(iopts.install_folder, file_name);
      const text: string = fs.readFileSync(file_path, "utf8");
      pfcounts.add(
        await api_create_file(creds, opts, file_name, api_key, project_id, text)
      );
    }

    // for writing text file
    // project_id: id of project where file is created (required)
    // path: path to file, relative to home directory in destination project (required)
    // content: contents of the text file to be written (required)
    await time_log2(this_file, tm_start, creds, opts);
  } catch (e) {
    pfcounts.fail += 1;
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
  debuglog(this_file + " get_key done");
  return pfcounts;
};

const run_tests = async function() {
  // as of 2019-09-27, axios POST to CoCalc docker API fails
  // with "certificate has expired"
  // UNLESS the following setting is used
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  const cp = cli_parse();
  const pfcounts: PassFail = new PassFail();
  if (cp) {
    const x: PassFail = await install_api_session(cp.c, cp.o);
    pfcounts.add(x);
  }
  num_log("files written", Math.max(0, pfcounts.pass - 2));
};

run_tests();
