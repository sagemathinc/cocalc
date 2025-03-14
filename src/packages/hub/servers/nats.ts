/*
NATS WebSocket proxy -- this primarily just directly proxied the nats
websocket server, so outside browsers can connect to it.

This assumes there is a NATS server.  This gets configured in dev mode
automatically and started via:

$ cd ~/cocalc/src
$ pnpm nats-server

*/

import { createProxyServer } from "http-proxy";
import getLogger from "@cocalc/backend/logger";
import { type Router } from "express";
import { natsWebsocketServer } from "@cocalc/backend/data";

const logger = getLogger("hub:nats");

export async function proxyNatsWebsocket(req, socket, head) {
  logger.debug("nats proxy -- handling a connection");
  const target = natsWebsocketServer;
  const proxy = createProxyServer({
    ws: true,
    target,
    timeout: 3000,
  });
  proxy.ws(req, socket, head);
}

// this is immediately upgraded to a websocket
export function initNatsServer(router: Router) {
  router.get("/nats", async (_req, res) => {
    res.send("");
  });
}
