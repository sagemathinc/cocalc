// Websocket support

import { getEventListeners } from "node:events";
import getLogger from "@cocalc/hub/logger";
import stripRememberMeCookie from "./strip-remember-me-cookie";
import { versionCheckFails } from "./version";
import { proxyConatWebsocket } from "./proxy-conat";
import basePath from "@cocalc/backend/base-path";

const LISTENERS_HACK = true;

const logger = getLogger("proxy:handle-upgrade");

export default function initUpgrade(
  {
    httpServer,
    proxyConat,
    projectProxyHandlersPromise,
  }: { httpServer; proxyConat; projectProxyHandlersPromise?; isPersonal },
  proxy_regexp: string,
) {
  const re = new RegExp(proxy_regexp);

  let nextUpgrade: undefined | Function = undefined;
  let socketioUpgrade: undefined | Function = undefined;

  async function handleProxyUpgradeRequest(req, socket, head): Promise<void> {
    if (LISTENERS_HACK) {
      const v = getEventListeners(httpServer, "upgrade");
      if (v.length > 1) {
        // Nodejs basically assumes that there is only one listener for the "upgrade" handler,
        // but depending on how you run CoCalc, two others may get added:
        //    - a socketio server
        //    - a nextjs server
        // We check if anything extra got added and if so, identify it and properly
        // use it.  We identify the handle using `${f}` and using a heuristic for the
        // code. That's the best I can do and it's obviously brittle.
        // Note: rspack for the static app doesn't use a websocket, instead using SSE, so
        // fortunately it's not relevant and hmr works fine.  HMR for the nextjs server
        // tends to just refresh the page, probably because we're using rspack there too.
        for (const f of v) {
          if (f === handler) {
            // it's us -- leave it alone
            continue;
          }
          const source = `${f}`;
          //logger.debug(`found extra listener`, { f, source });
          if (source.includes("destroyUpgrade")) {
            // WARNING/BRITTLE! the socketio source code for the upgrade handler has a destroyUpgrade
            // option it checks for, whereas the nextjs one doesn't.
            if (socketioUpgrade === undefined) {
              socketioUpgrade = f;
            } else {
              logger.debug(
                "WARNING! discovered unknown upgrade listener!",
                source,
              );
            }
          } else {
            if (nextUpgrade === undefined) {
              nextUpgrade = f;
            } else {
              logger.debug(
                "WARNING! discovered unknown upgrade listener!",
                source,
              );
            }
          }
          logger.debug(
            `found extra listener -- detected, saved and removed 'upgrade' listener`,
            //source,
          );
          httpServer.removeListener("upgrade", f);
        }
      }
    }

    if (proxyConat && useSocketio(req.url)) {
      proxyConatWebsocket(req, socket, head);
      return;
    }

    if (!req.url.match(re)) {
      // it's to be handled by socketio or next
      if (socketioUpgrade !== undefined && useSocketio(req.url)) {
        socketioUpgrade(req, socket, head);
        return;
      }
      nextUpgrade?.(req, socket, head);
      return;
    }
    const projectProxyHandlers = await projectProxyHandlersPromise;
    if (projectProxyHandlers == null) {
      throw Error("no handler configured");
    }

    socket.on("error", (err) => {
      // server will crash sometimes without this:
      logger.debug("WARNING -- websocket socket error", err);
    });

    const dbg = (...args) => {
      logger.silly(req.url, ...args);
    };
    dbg("got upgrade request from url=", req.url);

    // Check that minimum version requirement is satisfied (this is in the header).
    // This is to have a way to stop buggy clients from causing trouble.  It's a purely
    // honor system sort of thing, but makes it possible for an admin to block clients
    // until they run newer code.  I used to have to use this a lot long ago...
    if (versionCheckFails(req)) {
      throw Error("client version check failed");
    }

    if (req.headers["cookie"] != null) {
      let cookie;
      ({ cookie } = stripRememberMeCookie(req.headers["cookie"]));
      req.headers["cookie"] = cookie;
    }
    projectProxyHandlers.handleUpgrade(req, socket, head);
  }

  const handler = async (req, socket, head) => {
    try {
      await handleProxyUpgradeRequest(req, socket, head);
    } catch (err) {
      const msg = `WARNING: error upgrading websocket url=${req.url} -- ${err}`;
      logger.debug(msg);
      denyUpgrade(socket);
    }
  };

  return handler;
}

function denyUpgrade(socket) {
  socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
  socket.destroy();
}

function useSocketio(url: string) {
  const u = new URL(url, "http://cocalc.com");
  let pathname = u.pathname;
  if (basePath.length > 1) {
    pathname = pathname.slice(basePath.length);
  }
  return pathname == "/conat/";
}
