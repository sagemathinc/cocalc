/*
Create the Primus realtime socket server
*/

import { BrowserClient } from "./browser-client";
import { len } from "../smc-webapp/frame-editors/generic/misc";
const { join } = require("path");

let primus_server = undefined;

// Primus devs don't care about typescript: https://github.com/primus/primus/pull/623
const Primus = require("primus");

const clients = {};

interface Logger {
  debug : Function;
  info : Function;
}

export function init_websocket_server(
  http_server: any,
  base_url: string,
  logger: Logger,
): void {
  const opts = { pathname: join(base_url, "/.smc/ws") };
  const primus = new Primus(http_server, opts);
  logger.debug("primus", `listening on ${opts.pathname}`);

  primus.on("connection", function(conn) {
    // Now handle the connection
    logger.debug(
      "primus",
      `new connection from ${conn.address.ip} -- ${conn.id}`
    );
    clients[conn.id] = new BrowserClient(conn, logger);
    logger.debug("primus", `num_clients=${len(clients)}`);
  });
}
