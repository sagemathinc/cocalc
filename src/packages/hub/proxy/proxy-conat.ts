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

const logger = getLogger("hub:proxy-conat");

let proxy: ProxyServer | null = null;
export async function proxyConatWebsocket(req, socket, head) {
  const conatServer = conatServer0
    ? conatServer0
    : `http://localhost:${conatClusterPort}${basePath.length > 1 ? basePath : ""}`;
  const i = req.url.lastIndexOf("/conat");
  const target = conatServer + req.url.slice(i);
  logger.debug(`conat proxy -- proxying a WEBSOCKET connection to ${target}`);
  // todo -- allowing no cookie, since that's used by projects and compute servers!
  // do NOT disable this until compute servers all set a cookie... which could be a long time.
  if (proxy == null) {
    // make the proxy server
    proxy = createProxyServer({
      ws: true,
      secure: false,
      target,
    });
    proxy.on("error", (err) => {
      logger.debug(`WARNING: conat websocket proxy error -- ${err}`);
    });
  }

  // connect the client's socket to conat via the proxy server:
  proxy.ws(req, socket, head);
}
