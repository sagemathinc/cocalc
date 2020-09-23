/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Project information server
*/

import { delay } from "awaiting";
import { exec as child_process_exec } from "child_process";
import { promisify } from "util";
const exec = promisify(child_process_exec);
import { ProjectInfo } from "./types";

class DummyInfo {
  channel: any;
  constructor(channel) {
    this.channel = channel;
    this.init();
  }

  private async ps() {
    try {
      const out = await exec("ps auxwwf");
      return out.stdout.trim();
    } catch (err) {
      return `Error -- ${err}`;
    }
  }

  private async init() {
    while (true) {
      const info: ProjectInfo = {
        timestamp: new Date().getTime(),
        ps: await this.ps(),
      };
      this.channel.write(info);
      await delay(5000);
    }
  }
}

export async function project_info(primus: any, logger: any): Promise<string> {
  const name = `project_info`;
  const channel = primus.channel(name);
  let dummy: any;

  async function init() {
    dummy = new DummyInfo(channel);
    dummy.init(); // don't await
  }
  await init();

  // TODO disable info collection if there is nobody listening…

  channel.on("connection", function (spark: any): void {
    // Now handle the connection
    logger.debug(
      "project_info channel",
      `new connection from ${spark.address.ip} -- ${spark.id}`
    );

    spark.on("close", function () {});
    spark.on("end", function () {});
    spark.on("data", function (data) {
      if (typeof data === "object") {
        switch (data.cmd) {
          case "kill":
            console.log(`kill ${spark.id}`);
            break;
        }
      }
    });
  });

  return name;
}
