/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Project information
*/

import { ProjectInfoCmds } from "./types";
import { ProjectInfoServer } from "./server";
import { exec } from "./utils";

// singleton, we instantiate it when we need it
let _info: ProjectInfoServer | undefined = undefined;

export function get_ProjectInfoServer(L: Function): ProjectInfoServer {
  if (_info != null) return _info;
  _info = new ProjectInfoServer(L);
  return _info;
}

export async function project_info_ws(
  primus: any,
  logger: { debug: Function }
): Promise<string> {
  const L = (...msg) => logger.debug("project_info:", ...msg);
  const name = `project_info`;
  const channel = primus.channel(name);

  function deregister(spark) {
    L(`deregistering ${spark.id}`);
  }

  channel.on("connection", function (spark: any): void {
    // Now handle the connection
    L(`channel: new connection from ${spark.address.ip} -- ${spark.id}`);

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
          case "signal":
            L(`Signal ${data.signal} from ${spark.id} for pids: ${data.pids}`);
            exec(`kill -s ${data.signal ?? 15} ${data.pids.join(" ")}`);
            break;
          default:
            throw Error("WARNING: unknown command -- " + data.cmd);
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
