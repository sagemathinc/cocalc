/*
NATS WebSocket proxy -- this primarily just directly proxied the nats
websocket server, so outside browsers can connect to it.

This assumes there is a NATS server.  This gets configured in dev mode
automatically and started via:

$ cd ~/cocalc/src
$ pnpm nats-server

*/

import { createProxyServer, type ProxyServer } from "http-proxy-3";
import getLogger from "@cocalc/backend/logger";
import { type Router } from "express";
import { natsWebsocketServer } from "@cocalc/backend/data";
import {
  versionCheckFails,
  init as initVersionCheck,
} from "@cocalc/hub/proxy/version";
import { delay } from "awaiting";
import basePath from "@cocalc/backend/base-path";
import { join } from "path";

const logger = getLogger("hub:nats");

// this is immediately upgraded to a websocket
export function initNatsServer({
  router,
  httpServer,
}: {
  router: Router;
  httpServer;
}) {
  initVersionCheck();
  router.get("/nats", async (_req, res) => {
    res.send("");
  });

  httpServer.on("upgrade", (req, socket, head) => {
    if (req.url == join(basePath, "nats")) {
      proxyNatsWebsocket(req, socket, head);
    }
  });
}

let proxy: ProxyServer | null = null;
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
  if (proxy == null) {
    // make the proxy server
    proxy = createProxyServer({
      ws: true,
      target,
    });
    proxy.on("error", (err) => {
      logger.debug(`WARNING: nats websocket proxy error -- ${err}`);
    });
  }

  // connect the client's socket to nats via the proxy server:
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
