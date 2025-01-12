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

import { connect, StringCodec } from "nats";
import { createProxyServer } from "http-proxy";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("hub:nats");

const NATS = "ws://localhost:8443";

export async function initNats() {
  logger.debug("initNats");
  // insecure just for fun test.
  evalServer();
}

export async function proxyNatsWebsocket(req, socket, head) {
  logger.debug("nats proxy -- handling a connection");
  const target = NATS;
  const proxy = createProxyServer({
    ws: true,
    target,
  });
  proxy.ws(req, socket, head);
}

async function evalServer() {
  logger.debug("initializing nats echo server");
  const nc = await connect();
  logger.debug(`connected to ${nc.getServer()}`);
  const sc = StringCodec();

  const sub = nc.subscribe("hub.eval");
  const handle = (msg) => {
    const data = sc.decode(msg.data);
    logger.debug("handling hub.eval", data);
    msg.respond(sc.encode(`echo from HUB - ${eval(data)}`));
  };

  for await (const msg of sub) {
    handle(msg);
  }
}
