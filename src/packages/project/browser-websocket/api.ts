/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
 * License
 */

// Websocket based request/response api.
//
// All functionality here is of the form:
//
//  -- one request
//  -- one response

import { getClient } from "@cocalc/project/client";
import { get_configuration } from "../configuration";
import { formatString } from "../formatters";
import { nbconvert as jupyter_nbconvert } from "../jupyter/convert";
import { jupyter_strip_notebook } from "@cocalc/jupyter/nbgrader/jupyter-parse";
import { jupyter_run_notebook } from "@cocalc/jupyter/nbgrader/jupyter-run";
import { x11_channel } from "../x11/server";
import { canonical_paths } from "./canonical-path";
import { eval_code } from "./eval-code";
import { realpath } from "./realpath";
import query from "./query";
import type { Mesg } from "@cocalc/comm/websocket/types";
import { version } from "@cocalc/util/smc-version";
import { getLogger } from "@cocalc/project/logger";
import execCode from "./exec-code";

const log = getLogger("websocket-api");

let primus: any = undefined;
export function init_websocket_api(_primus: any): void {
  primus = _primus;

  primus.on("connection", function (spark) {
    // Now handle the connection, which can be either from a web browser, or
    // from a compute server.
    log.debug(`new connection from ${spark.address.ip} -- ${spark.id}`);

    spark.on("request", async (data, done) => {
      log.debug("primus-api", "request", data, "REQUEST");
      const t0 = Date.now();
      try {
        const resp = await handleApiCall({ data, primus });
        //log.debug("primus-api", "response", resp);
        done(resp);
      } catch (err) {
        // put this in for debugging...
        // It's normal to sometimes get errors, e.g., when a Jupyter kernel
        // isn't yet available.
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

export async function handleApiCall({
  data,
  primus,
}: {
  data: Mesg;
  primus;
}): Promise<any> {
  const client = getClient();
  switch (data.cmd) {
    case "version":
      return version;
    case "canonical_paths":
      return await canonical_paths(data.paths);
    case "configuration":
      return await get_configuration(data.aspect, data.no_cache);
    case "formatter_string":
      return await formatString(data);
    case "exec":
      if (data.opts == null) {
        throw Error("opts must not be null");
      }
      return await execCode(data.opts);
    case "realpath":
      return realpath(data.path);
    case "query":
      return await query(client, data.opts);
    // todo: why?
    case "eval_code":
      return await eval_code(data.code);

    case "jupyter_strip_notebook":
      return await jupyter_strip_notebook(data.ipynb_path);
    case "jupyter_nbconvert":
      return await jupyter_nbconvert(data.opts);
    case "jupyter_run_notebook":
      return await jupyter_run_notebook(data.opts);

    case "x11_channel":
      return await x11_channel(client, primus, log, data.path, data.display);

    default:
      throw Error(
        `command "${
          (data as any).cmd
        }" not implemented -- restart your project (in Project --> Settings)`,
      );
  }
}
