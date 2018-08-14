/*
Create the Primus realtime socket server
*/

import { BrowserClient } from "./browser-client";
import { len } from "../smc-webapp/frame-editors/generic/misc";
import { callback } from "awaiting";
const { join } = require("path");

let primus_server = undefined;

// Primus devs don't care about typescript: https://github.com/primus/primus/pull/623
const Primus = require("primus");

const clients = {};

interface Logger {
  debug: Function;
  info: Function;
}

export function init_websocket_server(
  express: any,
  http_server: any,
  base_url: string,
  logger: Logger
): any {
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

    conn.on("end", function() {
      delete clients[conn.id];
      logger.debug("primus", "connection ended", `num_clients=${len(clients)}`);
    });

    conn.on("data", async function(data) {
      logger.debug("primus", "data", typeof data, JSON.stringify(data));
      //conn.write(data);
      if (data.path != null) {
        conn.write(
          await callback(
            require("../directory-listing").get_listing0,
            data.path,
            data.hidden
          )
        );
      } else if (data.eval != null) {
        conn.write(eval(data.eval));
      } else {
        conn.write(data);
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
