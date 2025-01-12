/*
Proof of concept NATS proxy.

We assume there is a NATS server running on localhost with this configuration:

# server.conf
websocket {
    listen: "localhost:8443"
    no_tls: true
}

You could start this with

    nats-server -config server.conf

*/

import { createProxyServer } from "http-proxy";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("hub:nats");

// todo: move to database/server settings/etc.?
const NATS_WS = "ws://localhost:8443";

export async function proxyNatsWebsocket(req, socket, head) {
  logger.debug("nats proxy -- handling a connection");
  const target = NATS_WS;
  const proxy = createProxyServer({
    ws: true,
    target,
  });
  proxy.ws(req, socket, head);
}
