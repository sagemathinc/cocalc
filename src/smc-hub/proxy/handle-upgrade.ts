// Websocket support

import * as LRU from "lru-cache";
import { versionCheckFails } from "./version";
import { getTarget } from "./target";
import getLogger from "../logger";
import base_path from "smc-util/base-path";

const winston = getLogger("proxy: handle-upgrade");


export default function init({ projectControl, isPersonal }: Options) {
  const cache = new LRU({
    max: 5000,
    maxAge: 1000 * 60 * 3,
  });
  
  export async function handleProxyUpgradeRequest(
    req,
    socket,
    head
  ): Promise<void> {
    const dbg = (m) => {
      winston.silly(`${req.url}: ${m}`);
    };
    dbg("got upgrade request");
    if (!isPersonal && versionCheckFails(req)) {
      dbg("websocket upgrade -- version check failed");
      return;
    }

    const url = req.url.slice(base_path.length);
    const { host, port, internal_url } = await getTarget({
      url,
      isPersonal,
      projectControl,
    });

    const target = `ws://${host}:${port}`;
    req.url = internal_url;
    if (cache.has(key)) {
      dbg("using cache");
      const proxy = cache.get(key);
      proxy.ws(req, socket, head);
      return;
    }

    dbg(`target = ${target}`);
    dbg("not using cache");
    const proxy = createProxyServer({
      ws: true,
      target,
      timeout: 0,
    });
    cache.set(key, proxy);
    proxy.on("error", (err) => {
      winston.debug(`websocket proxy error, so clearing cache -- ${err}`);
      cache.del(key);
    });
    proxy.on("close", () => {
      dbg("websocket proxy close, so removing from cache");
      cache.del(key);
    });
    proxy.ws(req, socket, head);
  }
  return async (req, socket, head) => {
    try {
      await handleProxyUpgradeRequest(req, socket, head);
    } catch (err) {
      winston.debug(`error upgrading to websocket -- ${err}`);
    }
  };
}
