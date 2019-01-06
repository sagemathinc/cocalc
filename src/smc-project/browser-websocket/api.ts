/* Websocket based request/response api.

All functionality here is of the form:

 -- one request
 -- one response

*/

import { callback } from "awaiting";
const {
  callback_opts
} = require("smc-util/async-utils");

import { browser_symmetric_channel } from "./symmetric_channel";

export function init_websocket_api(
  primus: any,
  logger: any,
  client: any
): void {
  primus.plugin("responder", require("primus-responder"));

  primus.on("connection", function(spark) {
    // Now handle the connection
    logger.debug(
      "primus api",
      `new connection from ${spark.address.ip} -- ${spark.id}`
    );
    spark.on("request", async function(data, done) {
      logger.debug("primus-api", "request", typeof data, JSON.stringify(data));
      try {
        const resp = await handle_api_call(client, data, primus, logger);
        //logger.debug("primus-api", "response", resp);
        done(resp);
      } catch (err) {
        console.trace();
        logger.debug("primus-api error stacktrack", err.stack, err);
        done({ error: err.toString(), status: "error" });
      }
    });
    /*spark.on("data", function(data) {
      logger.debug("primus-api", "data", typeof data, JSON.stringify(data));
    });*/
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
    case "terminal":
      return await terminal(primus, logger, data.path, data.options);
    case "lean":
      return await lean(client, primus, logger, data.opts);
    case "lean_channel":
      return await lean_channel(client, primus, logger, data.path);
    case "x11_channel":
      return await x11_channel(client, primus, logger, data.path, data.display);
    case "sync_channel":
      return await sync_channel(client, primus, logger, data.query, data.options);
    case "symmetric_channel":
      return await browser_symmetric_channel(client, primus, logger, data.name);
    default:
      throw Error(
        `command "${data.cmd}" not implemented -- try restarting your project`
      );
  }
}

/* implementation of the api calls */

const { get_listing } = require("../directory-listing");
async function listing(path: string, hidden?: boolean): Promise<object[]> {
  return await callback(get_listing, path, hidden);
}

import { handle_request as jupyter } from "../jupyter/websocket-api";

// Execute code
const { execute_code } = require("smc-util-node/misc_node");
interface ExecuteOutput {
  stdout: string;
  stderr: string;
  exit_code: number;
}
async function exec(opts: any): Promise<ExecuteOutput> {
  return await callback_opts(execute_code)(opts);
}

import { terminal } from "../terminal/server";

import { lean, lean_channel } from "../lean/server";

import { x11_channel } from "../x11/server";

import { sync_channel } from "../sync/server";
