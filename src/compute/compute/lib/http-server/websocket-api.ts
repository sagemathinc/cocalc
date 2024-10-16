/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Similar to @cocalc/project/browser-websocket/api.ts
// It might make sense to refactor this with that -- not sure yet.

import { getLogger } from "../logger";
import { version } from "@cocalc/util/smc-version";
import type { Mesg } from "@cocalc/comm/websocket/types";
import getListing from "@cocalc/backend/get-listing";
import { executeCode } from "@cocalc/backend/execute-code";

const log = getLogger("websocket-api");

let primus: any = undefined;
export function initWebsocketApi({ primus: primus0, manager }): void {
  primus = primus0;

  primus.on("connection", function (spark) {
    log.debug(`new connection from ${spark.address.ip} -- ${spark.id}`);

    spark.on("request", async (data, done) => {
      log.debug("primus-api", "request", data, "REQUEST");
      const t0 = Date.now();
      try {
        const resp = await handleApiCall(data, spark, manager);
        done(resp);
      } catch (err) {
        // console.trace(); log.debug("primus-api error stacktrack", err.stack, err);
        done({ error: err.toString(), status: "error" });
      }
      log.debug(
        "primus-api",
        "request",
        data,
        `FINISHED: time=${Date.now() - t0}ms`,
      );
    });
  });

  primus.on("disconnection", function (spark) {
    log.debug(
      "primus-api",
      `end connection from ${spark.address.ip} -- ${spark.id}`,
    );
  });
}

async function handleApiCall(data: Mesg, _spark, manager): Promise<any> {
  switch (data.cmd) {
    case "version":
      return version;
    case "listing":
      // see packages/sync-fs/lib/index.ts
      return await getListing(data.path, data.hidden, manager.home);
    case "exec":
      if (data.opts == null) {
        throw Error("opts must not be null");
      }
      return await executeCode({
        ...data.opts,
        home: manager.home,
        ccNewFile: true,
      });
    default:
      throw Error(`command "${(data as any).cmd}" not implemented`);
  }
}
