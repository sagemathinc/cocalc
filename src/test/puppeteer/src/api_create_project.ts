const path = require("path");
const this_file: string = path.basename(__filename, ".js");
const debuglog = require("util").debuglog("cc-" + this_file);

import chalk from "chalk";
import { Creds, Opts, TestGetString } from "./types";
import { time_log2 } from "./time_log";
import axios from "axios";
import { expect } from "chai";

export const api_create_project = async function(
  creds: Creds,
  opts: Opts,
  api_key: string
): Promise<TestGetString> {
  const ags: TestGetString = new TestGetString();
  try {
    const tm_start = process.hrtime.bigint();
    const url: string =
      creds.url.replace(/\/app.*/, "") + "/api/v1/create_project";
    debuglog("url", url);

    const desc: string = new Date().toISOString();
    const response = await axios({
      method: "post",
      url: url,
      auth: {
        username: api_key,
        password: ""
      },
      data: {
        title: creds.project,
        description: desc,
        start: true
      }
    });
    debuglog("title: ", creds.project);
    debuglog("description: ", desc);
    expect(response.status).to.equal(200);
    const event: string = response.data.event;
    if (event === "error") console.log(chalk.red(`ERROR: ${response.data}`));
    expect(response.data.event).to.equal("project_created");
    const project_id: string = response.data.project_id;
    debuglog("project_id", project_id);
    expect(project_id.length).to.equal(36);
    await time_log2(this_file, tm_start, creds, opts);
    ags.result = project_id;
    ags.pass += 1;
  } catch (e) {
    ags.fail += 1;
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
  debuglog(this_file + " done");
  return ags;
};
