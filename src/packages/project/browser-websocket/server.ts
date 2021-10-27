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

// We are NOT using UglifyJS because it can easily take 3 blocking seconds of cpu
// during project startup to save 100kb -- it just isn't worth it.  Obviously, it
// would be optimal to build this one and for all into the project image.  TODO.
//const UglifyJS = require("uglify-js");
import { init_websocket_api } from "./api";

import { getLogger } from "@cocalc/project/logger";

export default function init(server: Server, basePath: string): Router {
  const winston = getLogger("websocket-server");
  const opts = {
    pathname: join(basePath, ".smc", "ws"),
    transformer: "websockets",
  };
  winston.info(`Initalizing primus websocket server at "${opts.pathname}"...`);
  const primus = new Primus(server, opts);

  // add multiplex to Primus so we have channels.
  primus.plugin("multiplex", require("primus-multiplex"));

  init_websocket_api(primus);

  const router = Router();
  const library: string = primus.library();
  // See note above.
  //UglifyJS.minify(primus.library()).code;

  router.get("/.smc/primus.js", (_, res) => {
    winston.debug("serving up minified primus.js to a specific client");
    res.send(library);
  });
  winston.info(
    `waiting for clients to request primus.js (length=${library.length})...`
  );

  return router;
}
