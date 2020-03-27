const path = require("path");
const this_file: string = path.basename(__filename, ".js");
const debuglog = require("util").debuglog("cc-" + this_file);

import chalk from "chalk";
import { Creds, Opts, PassFail, TestGetString } from "./types";
import { time_log2 } from "./time_log";
import { get_api_key } from "./get_api_key";
import get_account_id from "./get_account_id";
import get_auth_token from "./get_auth_token";
import { get_project_id } from "./get_project_id";
import { get_project_status } from "./get_project_status";
import { api_project_exec } from "./api_project_exec";

export const api_session = async function (creds: Creds, opts: Opts): Promise<PassFail> {
  const pfcounts: PassFail = new PassFail();
  if (opts.skip && opts.skip.test(this_file)) {
    debuglog("skipping test: " + this_file);
    pfcounts.skip += 1;
    return pfcounts;
  }
  try {
    const tm_start = process.hrtime.bigint();
    let ags: TestGetString;

    ags = await get_api_key(creds, opts);
    const api_key = ags.result;
    pfcounts.add(ags);

    ags = await get_account_id(creds, opts, api_key);
    const account_id: string = ags.result;
    pfcounts.add(ags);

    ags = await get_auth_token(creds, opts, api_key, account_id);
    // uncomment next line when auth_token is used
    // const auth_token: string = ags.result;
    pfcounts.add(ags);

    ags = await get_project_id(creds, opts, api_key);
    // uncomment next line when project_id is used
    const project_id: string = ags.result;
    pfcounts.add(ags);

    ags = await get_project_status(creds, opts, api_key, project_id);
    pfcounts.add(ags);

    const command: string = "julia -v";
    const wanted_output: string = "julia version 1.2.0\n";
    ags = await api_project_exec(creds, opts, api_key, project_id, command, wanted_output);
    pfcounts.add(ags);

    await time_log2(this_file, tm_start, creds, opts);
  } catch (e) {
    pfcounts.fail += 1;
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
  debuglog(this_file + " done");
  return pfcounts;
};
