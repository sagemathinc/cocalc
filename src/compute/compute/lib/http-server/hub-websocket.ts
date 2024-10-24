/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Create websocket similar to connection to normal hub.
Handle stuff that doesn't directly involve the project or compute server,
e.g., user identity.
*/

import { Router } from "express";
import { Server } from "http";
import Primus from "primus";
import { getLogger } from "../logger";
import { from_json_socket, to_json_socket } from "@cocalc/util/misc";
import * as message from "@cocalc/util/message";

const logger = getLogger("hub-websocket");

export default function initHubWebsocket({
  server,
  manager,
}: {
  server: Server;
  manager;
}): Router {
  const opts = {
    pathname: "/hub",
    transformer: "websockets",
  } as const;
  logger.debug(`Initializing primus websocket server at "${opts.pathname}"...`);
  const primus = new Primus(server, opts);
  initApi({ primus, manager });

  const router = Router();
  const library: string = primus.library();

  // it isn't actually minified, but this is what the static code expects.
  router.get("/primus.min.js", (_, res) => {
    logger.debug("serving up /primus.min.js to a specific client");
    res.send(library);
  });
  logger.debug(
    `waiting for browser client to request primus.min.js (length=${library.length})...`,
  );

  return router;
}

function initApi({ primus, manager }): void {
  primus.on("connection", (spark) => {
    logger.debug(`HUB: new connection from ${spark.address.ip} -- ${spark.id}`);

    const sendResponse = (mesg) => {
      const data = to_json_socket(mesg);
      spark.write(data);
    };

    spark.on("data", async (data) => {
      const mesg = from_json_socket(data);
      logger.debug("HUB:", "request", mesg, "REQUEST");
      const t0 = Date.now();
      try {
        const resp0 = await handleApiCall(mesg, spark, manager, primus);
        const resp = {
          ...resp0,
          id: mesg.id,
        };
        sendResponse(resp);
        logger.debug(
          "HUB",
          "response",
          resp,
          `FINISHED: time=${Date.now() - t0}ms`,
        );
      } catch (err) {
        // console.trace(); logger.debug("primus-api error stacktrack", err.stack, err);
        logger.debug("HUB:", "failed response to", mesg, "FAILED", `${err}`);
        sendResponse({ id: mesg.id, error: err.toString() });
      }
    });
  });

  primus.on("disconnection", (spark) => {
    logger.debug(`HUB: end connection from ${spark.address.ip} -- ${spark.id}`);
  });
}

async function handleApiCall(mesg, spark, manager, primus): Promise<object> {
  // @ts-ignore
  const _foo = { mesg, spark, manager, primus };
  switch (mesg.event) {
    case "ping":
      return message.pong({ now: new Date() });
  }
  throw Error("not implemented");
}
