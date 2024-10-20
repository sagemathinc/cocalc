/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Project information


NOTE:
It seems like project_info_ws sets up up an entire websocket channel, but literally the only 
thing it does is implement one command to send a kill signal to a process. There's an exec
api that could do the same thing already.  Maybe there was a big plan to add a much more sophisticated
API, but it hasn't happened yet?

*/

import { ProjectInfoCmds } from "@cocalc/util/types/project-info/types";
import { ProjectInfoServer } from "./server";
import { exec } from "./utils";

// singleton, we instantiate it when we need it
let _info: ProjectInfoServer | undefined = undefined;

export function get_ProjectInfoServer(): ProjectInfoServer {
  if (_info != null) return _info;
  _info = new ProjectInfoServer();
  return _info;
}

export async function project_info_ws(
  primus,
  logger: { debug: Function },
): Promise<string> {
  const L = (...msg) => logger.debug("project_info:", ...msg);
  const name = `project_info`;
  const channel = primus.channel(name);

  function deregister(spark) {
    L(`deregistering ${spark.id}`);
  }

  channel.on("connection", (spark): void => {
    // Now handle the connection
    L(`channel: new connection from ${spark.address.ip} -- ${spark.id}`);

    function close(type) {
      L(`event ${type}: deregistering`);
      deregister(spark);
    }

    spark.on("close", () => close("close"));
    spark.on("end", () => close("end"));
    spark.on("data", (data: ProjectInfoCmds) => {
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

  channel.on("disconnection", (spark): void => {
    L(`channel: disconnection from ${spark.address.ip} -- ${spark.id}`);
    deregister(spark);
  });

  return name;
}
