/*
Create the Primus realtime socket server
*/

import { BrowserClient } from "./browser-client";
import { len } from "../smc-util/misc2";
import { callback } from "awaiting";
const { join } = require("path");

let primus_server = undefined;

// Primus devs don't care about typescript: https://github.com/primus/primus/pull/623
const Primus = require("primus");

import { init_websocket_api } from "./api";

const clients = {};

interface Logger {
  debug: Function;
  info: Function;
}

export function init_websocket_server(
  express: any,
  http_server: any,
  base_url: string,
  logger: Logger,
  client: any
): any {
  // Create primus server object:
  const opts = {
    pathname: join(base_url, "/.smc/ws"),
    transformer: "websockets"
  };
  const primus = new Primus(http_server, opts);

  // add multiplex to Primus so we have channels.
  primus.plugin("multiplex", require("primus-multiplex"));

  logger.debug("primus", `listening on ${opts.pathname}`);

  init_websocket_api(primus, logger, client);

  const eval_channel = primus.channel("eval");
  eval_channel.on("connection", function(spark) {
    // Now handle the connection
    logger.debug(
      "primus eval",
      `new connection from ${spark.address.ip} -- ${spark.id}`
    );
    spark.on("data", async function(data) {
      logger.debug("primus", "data", typeof data, JSON.stringify(data));
      try {
        eval_channel.write(eval(data));
      } catch (err) {
        spark.write(err.toString());
      }
    });
  });

  const router = express.Router();
  const library: string = primus.library();

  router.get("/.smc/primus.js", (req, res) => {
    logger.debug("primus", "serving up primus.js");
    res.send(library);
  });
  return router;
}
