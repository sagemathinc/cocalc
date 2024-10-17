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
import { callback2 } from "@cocalc/util/async-utils";
import { terminal } from "@cocalc/terminal";
import realpath from "@cocalc/backend/realpath";
import { eval_code } from "@cocalc/backend/eval-code";
import synctableChannel from "./synctable-channel";

const log = getLogger("websocket-api");

export function initWebsocketApi({ primus, manager }): void {
  primus.on("connection", function (spark) {
    log.debug(`new connection from ${spark.address.ip} -- ${spark.id}`);

    spark.on("request", async (data, done) => {
      log.debug("primus-api", "request", data, "REQUEST");
      const t0 = Date.now();
      try {
        const resp = await handleApiCall(data, spark, manager, primus);
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

async function handleApiCall(
  data: Mesg,
  _spark,
  manager,
  primus,
): Promise<any> {
  switch (data.cmd) {
    case "version":
      return version;
    case "listing":
      // see packages/sync-fs/lib/index.ts
      return await getListing(data.path, data.hidden, manager.home);

    // TODO
    case "delete_files":
    case "move_files":
    case "rename_file":
    case "canonical_paths":
    case "configuration":
    case "prettier": // deprecated
    case "formatter":
    case "prettier_string": // deprecated
    case "formatter_string":
      throw Error(`command "${(data as any).cmd}" not implemented`);

    case "exec":
      if (data.opts == null) {
        throw Error("opts must not be null");
      }
      return await executeCode({
        ...data.opts,
        home: manager.home,
        ccNewFile: true,
      });

    case "query":
      if (data.opts?.changes) {
        throw Error("changefeeds are not supported for api queries");
      }
      return await callback2(
        manager.client.query.bind(manager.client),
        data.opts,
      );

    case "terminal":
      // this might work but be TOTALLY WRONG (?)... or require
      // some thought about who "hosts" the terminal.
      return await terminal(primus, data.path, data.options);

    case "eval_code":
      return await eval_code(data.code);

    case "realpath":
      return realpath(data.path, manager.home);

    case "synctable_channel":
      return await synctableChannel({
        manager,
        query: data.query,
        options: data.options,
        primus,
      });

    // TODO
    case "lean":
    case "jupyter_strip_notebook":
    case "jupyter_nbconvert":
    case "jupyter_run_notebook":
    case "lean_channel":
    case "x11_channel":
    case "syncdoc_call":
    case "symmetric_channel":
    case "project_info":
    case "compute_filesystem_cache":
    case "sync_fs":
    case "compute_server_sync_register":
    case "compute_server_compute_register":
    case "compute_server_sync_request":
    case "copy_from_project_to_compute_server":
    case "copy_from_compute_server_to_project":
    default:
      throw Error(`command "${(data as any).cmd}" not implemented`);
  }
}
