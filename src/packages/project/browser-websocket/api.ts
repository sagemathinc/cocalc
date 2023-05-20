/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
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
import { run_formatter, run_formatter_string } from "../formatters";
import { nbconvert as jupyter_nbconvert } from "../jupyter/convert";
import { lean, lean_channel } from "../lean/server";
import { jupyter_strip_notebook } from "@cocalc/jupyter/nbgrader/jupyter-parse";
import { jupyter_run_notebook } from "@cocalc/jupyter/nbgrader/jupyter-run";
import { synctable_channel } from "../sync/server";
import { syncdoc_call } from "../sync/sync-doc";
import { terminal } from "../terminal/server";
import { x11_channel } from "../x11/server";
import { canonical_paths } from "./canonical-path";
import { delete_files } from "./delete-files";
import { eval_code } from "./eval-code";
import { move_files, rename_file } from "./move-files";
import { realpath } from "./realpath";
import { project_info_ws } from "../project-info";
import { Mesg } from "@cocalc/frontend/project/websocket/types";
import { reuseInFlight } from "async-await-utils/hof";
import query from "./query";
import { browser_symmetric_channel } from "./symmetric_channel";

import { getLogger } from "@cocalc/project/logger";
const log = getLogger("websocket-api");

let primus: any = undefined;
export function init_websocket_api(_primus: any): void {
  primus = _primus;
  primus.plugin("responder", require("primus-responder"));

  primus.on("connection", function (spark) {
    // Now handle the connection
    log.debug(`new connection from ${spark.address.ip} -- ${spark.id}`);

    spark.on("request", async function (data, done) {
      log.debug("primus-api", "request", data, "REQUEST");
      const t0 = new Date().valueOf();
      try {
        const resp = await handleApiCall(data);
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
        `FINISHED: time=${new Date().valueOf() - t0}ms`
      );
    });
  });

  primus.on("disconnection", function (spark) {
    log.debug(
      "primus-api",
      `end connection from ${spark.address.ip} -- ${spark.id}`
    );
  });
}

async function handleApiCall0(data: Mesg): Promise<any> {
  const client = getClient();
  switch (data.cmd) {
    case "listing":
      return await listing(data.path, data.hidden);
    case "delete_files":
      return await delete_files(data.paths, log);
    case "move_files":
      return await move_files(data.paths, data.dest, log);
    case "rename_file":
      return await rename_file(data.src, data.dest, log);
    case "canonical_paths":
      return await canonical_paths(data.paths);
    case "configuration":
      return await get_configuration(data.aspect, data.no_cache);
    case "prettier": // deprecated
    case "formatter":
      return await run_formatter(client, data.path, data.options, log);
    case "prettier_string": // deprecated
    case "formatter_string":
      return await run_formatter_string(data.path, data.str, data.options, log);
    case "jupyter":
      return await jupyter(data.path, data.endpoint, data.query);
    case "exec":
      return await exec(data.opts);
    case "query":
      return await query(client, data.opts);
    case "eval_code":
      return eval_code(data.code);
    case "terminal":
      return await terminal(primus, log, data.path, data.options);
    case "lean":
      return await lean(client, primus, log, data.opts);
    case "jupyter_strip_notebook":
      return await jupyter_strip_notebook(data.ipynb_path);
    case "jupyter_nbconvert":
      return await jupyter_nbconvert(data.opts);
    case "jupyter_run_notebook":
      return await jupyter_run_notebook(log, data.opts);
    case "lean_channel":
      return await lean_channel(client, primus, log, data.path);
    case "x11_channel":
      return await x11_channel(client, primus, log, data.path, data.display);
    case "synctable_channel":
      return await synctable_channel(
        client,
        primus,
        log,
        data.query,
        data.options
      );
    case "syncdoc_call":
      return await syncdoc_call(data.path, log, data.mesg);
    case "symmetric_channel":
      return await browser_symmetric_channel(client, primus, log, data.name);
    case "realpath":
      return realpath(data.path);
    case "project_info":
      return await project_info_ws(primus, log);
    default:
      throw Error(
        `command "${
          (data as any).cmd
        }" not implemented -- restart your project (in Project --> Settings)`
      );
  }
}
const handleApiCall = reuseInFlight(handleApiCall0);

/* implementation of the api calls */

import { DirectoryListingEntry } from "@cocalc/util/types";
import { get_listing } from "../directory-listing";
async function listing(
  path: string,
  hidden?: boolean
): Promise<DirectoryListingEntry[]> {
  return await get_listing(path, hidden);
}

import { handle_request as jupyter } from "@cocalc/jupyter/kernel/websocket-api";

// Execute code
import { executeCode } from "@cocalc/backend/execute-code";

import type {
  ExecuteCodeOptions,
  ExecuteCodeOutput,
} from "@cocalc/util/types/execute-code";

export async function exec(
  opts: ExecuteCodeOptions
): Promise<ExecuteCodeOutput> {
  return await executeCode(opts);
}
