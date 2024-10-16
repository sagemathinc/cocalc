/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Create the Primus realtime socket server.

Similar to @cocalc/project/browser-websocket/server.ts
*/

import { join } from "path";
import { Router } from "express";
import { Server } from "http";
import Primus from "primus";
import type { PrimusWithChannels } from "@cocalc/terminal";
import { getLogger } from "../logger";
const logger = getLogger("websocket");

export default function initWebsocket(
  server: Server,
  basePath: string,
): Router {
  const opts = {
    pathname: join(basePath, ".smc", "ws"),
    transformer: "websockets",
  } as const;
  logger.debug(`Initializing primus websocket server at "${opts.pathname}"...`);
  const primus = new Primus(server, opts) as PrimusWithChannels;

  // add multiplex to Primus so we have channels.
  primus.plugin("multiplex", require("@cocalc/primus-multiplex"));
  primus.plugin("responder", require("@cocalc/primus-responder"));

  const router = Router();
  const library: string = primus.library();
  // See note above.
  //UglifyJS.minify(primus.library()).code;

  router.get("/.smc/primus.js", (_, res) => {
    logger.debug("serving up primus.js to a specific client");
    res.send(library);
  });
  logger.debug(
    `waiting for clients to request primus.js (length=${library.length})...`,
  );

  return router;
}
