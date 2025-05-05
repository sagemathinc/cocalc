/*
NATS WebSocket proxy -- this primarily just directly proxied the nats
websocket server, so outside browsers can connect to it.

This assumes there is a NATS server.  This gets configured in dev mode
automatically and started via:

$ cd ~/cocalc/src
$ pnpm nats-server

*/

import { createProxyServer } from "http-proxy-node16";
import getLogger from "@cocalc/backend/logger";
import { type Router } from "express";
import { natsWebsocketServer } from "@cocalc/backend/data";
import {
  versionCheckFails,
  init as initVersionCheck,
} from "@cocalc/hub/proxy/version";
import { delay } from "awaiting";

const logger = getLogger("hub:nats");

export async function proxyNatsWebsocket(req, socket, head) {
  const target = natsWebsocketServer;
  logger.debug(`nats proxy -- proxying a connection to ${target}`);
  // todo -- allowing no cookie, since that's used by projects and compute servers!
  // do NOT disable this until compute servers all set a cookie... which could be a long time.
  if (versionCheckFails(req)) {
    logger.debug("NATS client failed version check -- closing");
    socket.destroy();
    return;
  }
  const proxy = createProxyServer({
    ws: true,
    target,
    timeout: 5000,
  });
  proxy.ws(req, socket, head);

  while (socket.readyState !== socket.CLOSED) {
    if (versionCheckFails(req)) {
      logger.debug("NATS client failed version check -- closing");
      setTimeout(() => socket.end(), 10 * 1000);
      return;
    }
    await delay(2 * 60 * 1000);
  }
}

// this is immediately upgraded to a websocket
export function initNatsServer(router: Router) {
  initVersionCheck();
  router.get("/nats", async (_req, res) => {
    res.send("");
  });
}
