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
import { EventEmitter } from "events";
import { ProjectInfo, ProjectInfoCmds, Processes } from "./types";

class ProjectInfoServer extends EventEmitter {
  dbg: Function;
  last?: ProjectInfo;

  constructor(L) {
    super();
    this.dbg = (...msg) => L("ProjectInfoServer", ...msg);
    this.start();
  }

  private async processes(): Promise<Processes> {
    const procs: Processes = [];
    for (const i of [123, 94923, 832]) {
      procs.push({
        pid: i,
        ppid: i + 1,
        cmd: `cmd=${i}`,
        args: ["asdf", "fdsa", `${i}`],
        category: "other",
        cpu: i,
        mem: i + 100,
      });
    }
    return procs;
  }

  private async ps(): Promise<string> {
    try {
      const out = await exec("ps auxwwf");
      return out.stdout.trim();
    } catch (err) {
      return `Error -- ${err}`;
    }
  }

  public new_listener(send_data) {
    if (this.last != null) send_data(this.last);
  }

  private async start() {
    this.dbg("start");
    while (true) {
      // TODO disable info collection if there is nobody listening for a few minutes…
      this.dbg(`listeners on 'info': ${this.listenerCount("info")}`);
      const [ps, processes] = await Promise.all([this.ps(), this.processes()]);
      const info: ProjectInfo = {
        timestamp: new Date().getTime(),
        ps,
        processes,
      };
      this.last = info;
      this.emit("info", info);
      await delay(5000);
    }
  }
}

// singleton
let _info: ProjectInfoServer | undefined = undefined;

function init(L: Function): ProjectInfoServer {
  if (_info != null) return _info;
  _info = new ProjectInfoServer(L);
  return _info;
}

export async function project_info(
  primus: any,
  logger: { debug: Function }
): Promise<string> {
  const L = (...msg) => logger.debug("project_info:", ...msg);
  const name = `project_info`;
  const channel = primus.channel(name);
  const info = await init(L);

  function send_data(data) {
    channel.write(data);
  }

  info.on("info", send_data);

  function deregister(spark) {
    L(`deregistering ${spark.id}`);
    info.off("info", send_data);
  }

  channel.on("connection", function (spark: any): void {
    // Now handle the connection
    L(`channel: new connection from ${spark.address.ip} -- ${spark.id}`);

    // if we already have something, send it immediately
    info.new_listener(send_data);

    function close(type) {
      L(`event ${type}: deregistering`);
      deregister(spark);
    }

    spark.on("close", () => close("close"));
    spark.on("end", () => close("end"));
    spark.on("data", function (data: ProjectInfoCmds) {
      // we assume only ProjectInfoCmds should come in, but better check what this is
      if (typeof data === "object") {
        switch (data.cmd) {
          case "kill":
            L(`kill from ${spark.id} for pid ${data.pid}`);
            break;
        }
      }
    });
  });

  channel.on("disconnection", function (spark: any): void {
    L(`channel: disconnection from ${spark.address.ip} -- ${spark.id}`);
    deregister(spark);
  });

  return name;
}
