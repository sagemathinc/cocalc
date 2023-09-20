// Websocket support

import LRU from "lru-cache";
import { createProxyServer } from "http-proxy";
import { versionCheckFails } from "./version";
import { getTarget } from "./target";
import getLogger from "../logger";
import { stripBasePath } from "./util";
import { ProjectControlFunction } from "@cocalc/server/projects/control";
import stripRememberMeCookie from "./strip-remember-me-cookie";

const logger = getLogger("proxy:handle-upgrade");

interface Options {
  projectControl: ProjectControlFunction;
  isPersonal: boolean;
}

export default function init(
  { projectControl, isPersonal }: Options,
  proxy_regexp: string
) {
  const cache = new LRU({
    max: 5000,
    ttl: 1000 * 60 * 3,
  });

  const re = new RegExp(proxy_regexp);

  async function handleProxyUpgradeRequest(req, socket, head): Promise<void> {
    const dbg = (...args) => {
      logger.silly(req.url, ...args);
    };
    dbg("got upgrade request from url=", req.url);
    if (!req.url.match(re)) {
      throw Error(`url=${req.url} does not support upgrade`);
    }

    // Check that minimum version requirement is satisfied (this is in the header).
    // This is to have a way to stop buggy clients from causing trouble.  It's a purely
    // honor system sort of thing, but makes it possible for an admin to block clients
    // until they run newer code.  I used to have to use this a lot long ago...
    if (versionCheckFails(req)) {
      throw Error("client version check failed");
    }

    const url = stripBasePath(req.url);

    let remember_me, api_key;
    if (req.headers["cookie"] != null) {
      let cookie;
      ({ cookie, remember_me, api_key } = stripRememberMeCookie(
        req.headers["cookie"]
      ));
      req.headers["cookie"] = cookie;
    }

    dbg("calling getTarget");
    const { host, port, internal_url } = await getTarget({
      url,
      isPersonal,
      projectControl,
      remember_me,
      api_key,
    });
    dbg("got ", { host, port });

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

    dbg("target", target);
    dbg("not using cache");
    const proxy = createProxyServer({
      ws: true,
      target,
      timeout: 3000,
    });
    cache.set(target, proxy);

    // taken from https://github.com/http-party/node-http-proxy/issues/1401
    proxy.on("proxyRes", function (proxyRes) {
      //console.log(
      //  "Raw [target] response",
      //  JSON.stringify(proxyRes.headers, true, 2)
      //);

      proxyRes.headers["x-reverse-proxy"] = "custom-proxy";
      proxyRes.headers["cache-control"] = "no-cache, no-store";

      //console.log(
      //  "Updated [proxied] response",
      //  JSON.stringify(proxyRes.headers, true, 2)
      //);
    });

    proxy.on("error", (err) => {
      logger.debug(`websocket proxy error, so clearing cache -- ${err}`);
      cache.delete(target);
    });
    proxy.on("close", () => {
      dbg("websocket proxy closed, so removing from cache");
      cache.delete(target);
    });
    proxy.ws(req, socket, head);
  }

  return async (req, socket, head) => {
    try {
      await handleProxyUpgradeRequest(req, socket, head);
    } catch (err) {
      const msg = `WARNING: error upgrading websocket url=${req.url} -- ${err}`;
      logger.debug(msg);
      denyUpgrade(socket);
    }
  };
}

// this was suggested by GPT4...
function denyUpgrade(socket) {
  socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
  socket.destroy();
}
