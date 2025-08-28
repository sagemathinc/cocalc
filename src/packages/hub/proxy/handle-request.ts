/* Handle a proxy request */

import { createProxyServer, type ProxyServer } from "http-proxy-3";
import LRU from "lru-cache";
import stripRememberMeCookie from "./strip-remember-me-cookie";
import { versionCheckFails } from "./version";
import { getTarget } from "./target";
import getLogger from "../logger";
import { stripBasePath } from "./util";
import { ProjectControlFunction } from "@cocalc/server/projects/control";
import siteUrl from "@cocalc/database/settings/site-url";
import { parseReq } from "./parse";
import hasAccess from "./check-for-access-to-project";
import { handleFileDownload } from "@cocalc/conat/files/file-download";

const logger = getLogger("proxy:handle-request");

interface Options {
  projectControl: ProjectControlFunction;
  isPersonal: boolean;
}

export default function init({ projectControl, isPersonal }: Options) {
  /* Cache at most 5000 proxies, each for up to 3 minutes.
   Throwing away proxies at any time from the cache is fine since
   the proxy is just used to handle *individual* http requests,
   and the cache is entirely for speed.  Also, invalidating cache entries
   works around weird cases, where maybe error/close don't get
   properly called, but the proxy is not working due to network
   issues.  Invalidating cache entries quickly is also good from
   a permissions and security point of view.
*/

  const cache = new LRU<string, ProxyServer>({
    max: 5000,
    ttl: 1000 * 60 * 3,
  });

  async function handleProxyRequest(req, res): Promise<void> {
    const dbg = (...args) => {
      // for low level debugging -- silly isn't logged by default
      logger.silly(req.url, ...args);
    };
    dbg("got request");
    // dangerous/verbose to log...?
    // dbg("headers = ", req.headers);

    if (!isPersonal && versionCheckFails(req, res)) {
      dbg("version check failed");
      // note that the versionCheckFails function already sent back an error response.
      throw Error("version check failed");
    }

    // Before doing anything further with the request on to the proxy, we remove **all** cookies whose
    // name contains "remember_me", to prevent the project backend from getting at
    // the user's session cookie, since one project shouldn't be able to get
    // access to any user's account.
    let remember_me, api_key;
    if (req.headers["cookie"] != null) {
      let cookie;
      ({ cookie, remember_me, api_key } = stripRememberMeCookie(
        req.headers["cookie"],
      ));
      req.headers["cookie"] = cookie;
    }

    if (!isPersonal && !remember_me && !api_key) {
      dbg("no rememember me set, so blocking");
      // Not in personal mode and there is no remember_me or api_key set all, so
      // definitely block access.  4xx since this is a *client* problem.
      const url = await siteUrl();
      throw Error(
        `Please login to <a target='_blank' href='${url}'>${url}</a> with cookies enabled, then refresh this page.`,
      );
    }

    const url = stripBasePath(req.url);
    const parsed = parseReq(url, remember_me, api_key);
    // TODO: parseReq is called again in getTarget so need to refactor...
    const { type, project_id } = parsed;
    if (type == "files") {
      if (
        !(await hasAccess({
          project_id,
          remember_me,
          api_key,
          type: "read",
          isPersonal,
        }))
      ) {
        throw Error(`user does not have read access to project`);
      }
      await handleFileDownload({ req, res, url });
      return;
    }

    const { host, port, internal_url } = await getTarget({
      remember_me,
      api_key,
      url,
      isPersonal,
      projectControl,
      parsed,
    });

    // It's http here because we've already got past the ssl layer.  This is all internal.
    const target = `http://${host}:${port}`;
    dbg("target resolves to", target);

    let proxy;
    if (cache.has(target)) {
      // we already have the proxy for this target in the cache
      dbg("using cached proxy");
      proxy = cache.get(target);
    } else {
      logger.debug("make a new proxy server to", target);
      proxy = createProxyServer({
        ws: false,
        target,
      });
      // and cache it.
      cache.set(target, proxy);
      logger.debug("created new proxy");

      proxy.on("error", (err) => {
        logger.debug(`http proxy error -- ${err}`);
      });
    }

    if (internal_url != null) {
      dbg("changing req url from ", req.url, " to ", internal_url);
      req.url = internal_url;
    }
    dbg("handling the request using the proxy");
    proxy.web(req, res);
  }

  return async (req, res) => {
    try {
      await handleProxyRequest(req, res);
    } catch (err) {
      const msg = `WARNING: error proxying request ${req.url} -- ${err}`;
      try {
        // this will fail if handleProxyRequest already wrote a header, so we
        // try/catch it.
        res.writeHead(500, { "Content-Type": "text/html" });
      } catch {}
      try {
        res.end(msg);
      } catch {}
      // Not something to log as an error -- just debug; it's normal for it to happen, e.g., when
      // a project isn't running.
      logger.debug(msg);
    }
  };
}
