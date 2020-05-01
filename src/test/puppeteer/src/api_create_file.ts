/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

const path = require("path");
const this_file: string = path.basename(__filename, ".js");
const debuglog = require("util").debuglog("cc-" + this_file);

import chalk from "chalk";
import { Creds, Opts, PassFail } from "./types";
import { time_log2 } from "./time_log";
import axios from "axios";
import { expect } from "chai";

function sleep(ms: number = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const api_create_file = async function (
  creds: Creds,
  opts: Opts,
  file_path: string,
  api_key: string,
  project_id: string,
  content: string
): Promise<PassFail> {
  const pfcounts: PassFail = new PassFail();
  try {
    const tm_start = process.hrtime.bigint();
    const url: string = creds.url.replace(/\/app.*/, "") + "/api/v1/write_text_file_to_project";
    debuglog("url ", url);
    debuglog("writing ", file_path);

    // use retry loop because project might not be started
    const write_max_tries = 60;
    let step: number = 0;
    for (; step < write_max_tries; step++) {
      const response = await axios({
        method: "post",
        url: url,
        auth: {
          username: api_key,
          password: ""
        },
        data: {
          project_id: project_id,
          path: file_path,
          content: content
        }
      });
      expect(response.status).to.equal(200);
      //debuglog('RESPONSE DATA ', response.data);
      const event: string = response.data.event;
      //if (event === "error") console.log(chalk.red(`ERROR-A: ${JSON.stringify(response.data)}`));
      if (event === "error") {
        //console.log(chalk.red(`ERROR-A: ${response.data.error}`));
        debuglog(`${response.data.error}, retrying... ${step}`);
        await sleep(1000);
        continue;
      }
      expect(response.data.event).to.equal("file_written_to_project");
      break;
    }
    await time_log2(this_file, tm_start, creds, opts);
    pfcounts.pass += 1;
  } catch (e) {
    pfcounts.fail += 1;
    console.log(chalk.red(`ERROR-B: ${e.message}`));
  }
  debuglog(this_file + " done");
  return pfcounts;
};
