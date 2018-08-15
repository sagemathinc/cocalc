/* Websocket based request/response api.

All functionality here is of the form:

 -- one request
 -- one response

*/

import { callback } from "awaiting";

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
      // Echo the received request data
      try {
        const resp = await handle_api_call(client, data);
        //logger.debug("primus-api", "response", resp);
        done(resp);
      } catch (err) {
        done({ error: err.toString(), status: "error" });
      }
    });
    spark.on("data", function(data) {
      logger.debug("primus-api", "data", typeof data, JSON.stringify(data));
    });
  });
}

async function handle_api_call(client: any, data: any): Promise<any> {
  switch (data.cmd) {
    case "listing":
      return await listing(data.path, data.hidden);
    case "prettier":
      return await prettier(client, data.path, data.options);
    case "jupyter":
      return await jupyter(data.path, data.action, data.query);
    default:
      throw Error(`command "${data.cmd}" not implemented`);
  }
}

/* implementation of the api calls */

const { get_listing } = require("../directory-listing");
async function listing(path: string, hidden?: boolean): Promise<object[]> {
  return await callback(get_listing, path, hidden);
}

import { run_prettier } from "../prettier";
async function prettier(client: any, path: string, options: any): Promise<any> {
  return await run_prettier(client, path, options);
}

import { get_existing_kernel as get_jupyter_kernel } from "../jupyter/jupyter";
import { get_code_and_cursor_pos } from "../jupyter/http-server";

async function jupyter(path: string, action: string, query: any): Promise<any> {
  const kernel = get_jupyter_kernel(path);
  if (kernel == null) {
    throw Error(`no kernel with path '${path}'`);
  }
  switch (action) {
    case "complete":
      return await kernel.complete(get_code_and_cursor_pos(query));
    default:
      throw Error(`unknown action "${action}"`);
  }
}
