/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

const path = require("path");
const this_file: string = path.basename(__filename, ".js");
const debuglog = require("util").debuglog("cc-" + this_file);

import chalk from "chalk";
import { Creds, Opts, TestGetString } from "./types";
import { time_log2 } from "./time_log";
import axios from "axios";
import { expect } from "chai";

export const api_project_exec = async function (
  creds: Creds,
  opts: Opts,
  api_key: string,
  project_id: string,
  command: string,
  wanted_output: string
): Promise<TestGetString> {
  let ags: TestGetString = new TestGetString();
  try {
    const tm_start = process.hrtime.bigint();
    const url: string = creds.url.replace(/\/app.*/, "") + "/api/v1/project_exec";
    debuglog("url", url);

    const response = await axios({
      method: "post",
      url: url,
      auth: {
        username: api_key,
        password: ""
      },
      data: {
        project_id: project_id,
        command: command,
        bash: true
      }
    });
    expect(response.status).to.equal(200);
    const event: string = response.data.event;
    if (event === "error") console.log(chalk.red(`ERROR: ${response.data}`));
    expect(response.data.event).to.equal("project_exec_output");
    expect(response.data.exit_code).to.equal(0);
    const output: string = response.data.stdout;
    debuglog("output", output);
    expect(output).to.equal(wanted_output);
    await time_log2(this_file, tm_start, creds, opts);
    ags.result = output;
    ags.pass += 1;
  } catch (e) {
    ags.fail += 1;
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
  debuglog(this_file + " done");
  return ags;
};
