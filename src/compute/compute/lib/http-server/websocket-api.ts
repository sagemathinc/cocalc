/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Similar to @cocalc/project/browser-websocket/api.ts
// It might make sense to refactor this with that -- not sure yet.

import { getLogger } from "../logger";
import { version } from "@cocalc/util/smc-version";
import type { Mesg } from "@cocalc/comm/websocket/types";

const log = getLogger("websocket-api");

let primus: any = undefined;
export function initWebsocketApi(primus0): void {
  primus = primus0;

  primus.on("connection", function (spark) {
    log.debug(`new connection from ${spark.address.ip} -- ${spark.id}`);

    spark.on("request", async (data, done) => {
      log.debug("primus-api", "request", data, "REQUEST");
      const t0 = Date.now();
      try {
        const resp = await handleApiCall(data, spark);
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

async function handleApiCall(data: Mesg, _spark): Promise<any> {
  switch (data.cmd) {
    case "version":
      return version;
    case "listing":
      // see packages/sync-fs/lib/index.ts
      throw Error("todo");
    default:
      throw Error(`command "${(data as any).cmd}" not implemented`);
  }
}
