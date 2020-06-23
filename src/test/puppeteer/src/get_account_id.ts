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

const get_account_id = async function (creds: Creds, opts: Opts, api_key: string): Promise<TestGetString> {
  const ags: TestGetString = new TestGetString();
  if (opts.skip && opts.skip.test(this_file)) {
    debuglog("skipping test: " + this_file);
    ags.skip += 1;
    return ags;
  }
  try {
    const tm_start = process.hrtime.bigint();
    const url: string = creds.url.replace(/\/app.*/, "") + "/api/v1/user_search";
    const response = await axios({
      method: "post",
      url: url,
      auth: {
        username: api_key,
        password: ""
      },
      data: {
        query: creds.email
      }
    });
    expect(response.status).to.equal(200);
    expect(response.data.event).to.equal("user_search_results");
    const account_id: string = response.data.results[0].account_id;
    expect(account_id.length).to.equal(36);
    debuglog("account_id:", account_id);
    await time_log2(this_file, tm_start, creds, opts);
    ags.result = account_id;
    ags.pass += 1;
  } catch (e) {
    ags.fail += 1;
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
  debuglog(this_file + " done");
  return ags;
};

export default get_account_id;
