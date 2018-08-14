/* Websocket based request/response api.

All functionality here is of the form:

 -- one request
 -- one response

*/

import { callback } from "awaiting";

export function init_websocket_api(primus: any, logger: any): void {
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
        done(await handle_api_call(data));
      } catch (err) {
        done({ error: err.toString() });
      }
    });
    spark.on("data", function(data) {
      logger.debug("primus-api", "data", typeof data, JSON.stringify(data));
    });
  });
}

async function handle_api_call(data: any): Promise<any> {
  switch (data.cmd) {
    case "listing":
      return await listing(data.path, data.hidden);
    default:
      throw Error(`command "${data.cmd}" not implemented`);
  }
}

/* implementation of the api calls */

const { get_listing0 } = require("../directory-listing");
async function listing(path: string, hidden?: boolean): Promise<object[]> {
  return await callback(get_listing0, path, hidden);
}
