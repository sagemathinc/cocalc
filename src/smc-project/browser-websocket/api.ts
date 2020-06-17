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

// This require is just because typescript is confused by
// the path for now.  Growing pains.
const { callback_opts } = require("smc-util/async-utils");

import { browser_symmetric_channel } from "./symmetric_channel";
import { canonical_paths } from "./canonical-path";
import { eval_code } from "./eval-code";
import { terminal } from "../terminal/server";
import { lean, lean_channel } from "../lean/server";
import { nbgrader } from "../nbgrader/api";
import { jupyter_strip_notebook } from "../nbgrader/jupyter-parse";
import { jupyter_run_notebook } from "../nbgrader/jupyter-run";
import { x11_channel } from "../x11/server";
import { synctable_channel } from "../sync/server";
import { syncdoc_call } from "../sync/sync-doc";
import { get_configuration } from "../configuration";
import { delete_files } from "./delete-files";
import { rename_file, move_files } from "./move-files";

export function init_websocket_api(
  primus: any,
  logger: any,
  client: any
): void {
  primus.plugin("responder", require("primus-responder"));

  primus.on("connection", function (spark) {
    // Now handle the connection
    logger.debug(
      "primus-api",
      `new connection from ${spark.address.ip} -- ${spark.id}`
    );

    spark.on("request", async function (data, done) {
      logger.debug("primus-api", "request", typeof data, JSON.stringify(data));
      try {
        const resp = await handle_api_call(client, data, primus, logger);
        //logger.debug("primus-api", "response", resp);
        done(resp);
      } catch (err) {
        // put this in for debugging...
        // It's normal to sometimes get errors, e.g., when a Jupyter kernel
        // isn't yet available.
        // console.trace(); logger.debug("primus-api error stacktrack", err.stack, err);
        done({ error: err.toString(), status: "error" });
      }
    });
    /*spark.on("data", function(data) {
      logger.debug("primus-api", "data", typeof data, JSON.stringify(data));
    });*/
  });

  primus.on("disconnection", function (spark) {
    logger.debug(
      "primus-api",
      `end connection from ${spark.address.ip} -- ${spark.id}`
    );
  });
}

import { run_prettier, run_prettier_string } from "../formatters/prettier";

async function handle_api_call(
  client: any,
  data: any,
  primus: any,
  logger: any
): Promise<any> {
  switch (data.cmd) {
    case "listing":
      return await listing(data.path, data.hidden);
    case "delete_files":
      return await delete_files(data.paths, logger);
    case "move_files":
      return await move_files(data.paths, data.dest, logger);
    case "rename_file":
      return await rename_file(data.src, data.dest, logger);
    case "canonical_paths":
      return canonical_paths(data.paths);
    case "configuration":
      return await get_configuration(data.aspect, data.no_cache);
    case "prettier":
      return await run_prettier(client, data.path, data.options, logger);
    case "prettier_string":
      return await run_prettier_string(
        data.path,
        data.str,
        data.options,
        logger
      );
    case "jupyter":
      return await jupyter(data.path, data.endpoint, data.query);
    case "exec":
      return await exec(data.opts);
    case "eval_code":
      return eval_code(data.code);
    case "terminal":
      return await terminal(primus, logger, data.path, data.options);
    case "lean":
      return await lean(client, primus, logger, data.opts);
    case "nbgrader":
      return await nbgrader(client, logger, data.opts);
    case "jupyter_strip_notebook":
      return await jupyter_strip_notebook(data.ipynb_path);
    case "jupyter_run_notebook":
      return await jupyter_run_notebook(client, logger, data.opts);
    case "lean_channel":
      return await lean_channel(client, primus, logger, data.path);
    case "x11_channel":
      return await x11_channel(client, primus, logger, data.path, data.display);
    case "synctable_channel":
      return await synctable_channel(
        client,
        primus,
        logger,
        data.query,
        data.options
      );
    case "syncdoc_call":
      return await syncdoc_call(data.path, logger, data.mesg);
    case "symmetric_channel":
      return await browser_symmetric_channel(client, primus, logger, data.name);
    default:
      throw Error(
        `command "${data.cmd}" not implemented -- restart your project (in Project --> Settings)`
      );
  }
}

/* implementation of the api calls */

import { get_listing, ListingEntry } from "../directory-listing";
async function listing(
  path: string,
  hidden?: boolean
): Promise<ListingEntry[]> {
  return await get_listing(path, hidden);
}

import { handle_request as jupyter } from "../jupyter/websocket-api";

// Execute code
const { execute_code } = require("smc-util-node/misc_node");
interface ExecuteOutput {
  stdout: string;
  stderr: string;
  exit_code: number;
}
export async function exec(opts: any): Promise<ExecuteOutput> {
  return await callback_opts(execute_code)(opts);
}
