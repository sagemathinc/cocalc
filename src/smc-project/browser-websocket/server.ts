/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Create the Primus realtime socket server
*/

const { join } = require("path");
import { Router } from "express";
import { Server } from "http";

// Primus devs don't care about typescript: https://github.com/primus/primus/pull/623
const Primus = require("primus");
const UglifyJS = require("uglify-js");
import { init_websocket_api } from "./api";
import basePath from "smc-util-node/base-path";

import { getLogger } from "smc-project/logger";
const winston = getLogger("websocket-server");

export default function init(server: Server): Router {
  // Create primus server object:
  const opts = {
    pathname: join(basePath, ".smc", "ws"),
    transformer: "websockets",
  };
  const primus = new Primus(server, opts);

  // add multiplex to Primus so we have channels.
  primus.plugin("multiplex", require("primus-multiplex"));

  winston.info(`listening on ${opts.pathname}`);

  init_websocket_api(primus);

  const router = Router();
  const library: string = UglifyJS.minify(primus.library()).code;

  router.get("/.smc/primus.js", (_, res) => {
    winston.debug("serving up minified primus.js to a specific client");
    res.send(library);
  });
  winston.info(
    `waiting for clients to request mprimus.js (length=${library.length})...`
  );

  return router;
}
