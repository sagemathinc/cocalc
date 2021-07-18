// Websocket support

import * as LRU from "lru-cache";
import { createProxyServer } from "http-proxy";
import { versionCheckFails } from "./version";
import { getTarget } from "./target";
import getLogger from "../logger";
import { stripBasePath } from "./util";
import { ProjectControlFunction } from "smc-hub/servers/project-control";

const winston = getLogger("proxy: handle-upgrade");

interface Options {
  projectControl : ProjectControlFunction;
  isPersonal: boolean;
}

export default function init(
  { projectControl, isPersonal }: Options,
  proxy_regexp: string
) {
  const cache = new LRU({
    max: 5000,
    maxAge: 1000 * 60 * 3,
  });

  const re = new RegExp(proxy_regexp);

  async function handleProxyUpgradeRequest(req, socket, head): Promise<void> {
    const dbg = (m) => {
      winston.silly(`${req.url}: ${m}`);
    };
    dbg("got upgrade request");
    if (!isPersonal && versionCheckFails(req)) {
      dbg("version check failed");
      return;
    }

    if (!req.url.match(re)) {
      dbg(`nothing to do; req.url="${req.url}" doesn't need to be proxied`);
      return;
    }
    const url = stripBasePath(req.url);

    dbg("calling getTarget");
    const { host, port, internal_url } = await getTarget({
      url,
      isPersonal,
      projectControl,
    });
    dbg(`got ${host}, ${port}`);

    const target = `ws://${host}:${port}`;
    if (internal_url != null) {
      req.url = internal_url;
    }
    if (cache.has(target)) {
      dbg("using cache");
      const proxy = cache.get(target);
      (proxy as any)?.ws(req, socket, head);
      return;
    }

    dbg(`target = ${target}`);
    dbg("not using cache");
    const proxy = createProxyServer({
      ws: true,
      target,
      timeout: 0,
    });
    cache.set(target, proxy);
    proxy.on("error", (err) => {
      winston.debug(`websocket proxy error, so clearing cache -- ${err}`);
      cache.del(target);
    });
    proxy.on("close", () => {
      dbg("websocket proxy close, so removing from cache");
      cache.del(target);
    });
    proxy.ws(req, socket, head);
  }

  return async (req, socket, head) => {
    try {
      await handleProxyUpgradeRequest(req, socket, head);
    } catch (err) {
      winston.debug(`error upgrading to websocket url=${req.url} -- ${err}`);
    }
  };
}
