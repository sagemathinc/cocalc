/*
Conat WebSocket proxy -- this primarily just directly proxied the conats
socketio websocket server, so outside browsers can connect to it.
So far I'm only using this for testing, but it could be useful in a non-kubernetes
setting, where we need certain types of scalability.
*/

import { createProxyServer, type ProxyServer } from "http-proxy-3";
import getLogger from "@cocalc/backend/logger";
import {
  conatServer as conatServer0,
  conatClusterPort,
} from "@cocalc/backend/data";
import basePath from "@cocalc/backend/base-path";
import { conat } from "@cocalc/backend/conat";
import { type Client } from "@cocalc/conat/core/client";
import { delay } from "awaiting";

const logger = getLogger("hub:proxy-conat");

const ADDRESS_UPDATE_INTERVAL = 30_000;

export async function proxyConatWebsocket(req, socket, head) {
  const i = req.url.lastIndexOf("/conat");
  const target = randomServer() + req.url.slice(i);
  logger.debug(`conat proxy -- proxying a WEBSOCKET connection to ${target}`);
  // todo -- allowing no cookie, since that's used by projects and compute servers!
  // do NOT disable this until compute servers all set a cookie... which could be a long time.
  // make the proxy server
  const proxy: ProxyServer = createProxyServer({
    ws: true,
    secure: false,
    target,
  });
  proxy.on("error", (err) => {
    logger.debug(`WARNING: conat websocket proxy error -- ${err}`);
  });

  // connect the client's socket to conat via the proxy server:
  proxy.ws(req, socket, head);
}

let client: Client | null = null;
let addresses: string[] = [];
function randomServer(): string {
  if (client == null) {
    addressUpdateLoop();
  }
  if (addresses.length == 0) {
    addresses.push(
      conatServer0
        ? conatServer0
        : `http://localhost:${conatClusterPort}${basePath.length > 1 ? basePath : ""}`,
    );
    return addresses[0];
  }
  // random choice
  const i = Math.floor(Math.random() * addresses.length);
  return addresses[i];
}

async function addressUpdateLoop() {
  client = conat();
  await client.waitUntilSignedIn();
  if (!client.info?.clusterName) {
    // no point -- not a cluster
    return;
  }
  while (true) {
    try {
      addresses = await client.cluster();
      logger.debug("addressUpdateLoop: got", addresses);
    } catch (err) {
      logger.debug(
        "addressUpdateLoop: error -- updating cluster addresses",
        err,
      );
    }
    await delay(ADDRESS_UPDATE_INTERVAL);
  }
}
