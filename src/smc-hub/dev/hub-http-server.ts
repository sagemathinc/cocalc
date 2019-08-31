/* Functionality specific to the hub http server when hub is in dev mode.

Proxy server urls -- on SMC in production, HAproxy sends these requests directly to the proxy server
serving (from this process) on another port.  However, for development, we handle everything
directly in the hub server (there is no separate proxy server), so have to handle these routes
directly here.

This code is ONLY EVER TO BE USED IN DEV MODE!

WARNING: the implementation below is *totally insecure* -- it doesn't even check if
user is allowed access to the project.  This is fine in dev mode,
since all as the same user anyways.
*/

const proxy_cache = {};
const websocket_proxy_cache = {};

const hub_proxy = require("../proxy");

import { createProxyServer } from "http-proxy";
import { callback_opts } from "smc-util/async-utils";

function target_parse_req(
  url: string
): {
  key: string;
  port_number: string; // yes, as a string.
  project_id: string;
  type: string; //  'port' or 'raw' or 'server'
} {
  return hub_proxy.target_parse_req("", url);
}

async function raw_server_port(
  project_id: string,
  compute_server: any
): Promise<string> {
  const project = await callback_opts(compute_server.project)({ project_id });
  const status = await callback_opts(project.status)();
  if (status["raw.port"]) {
    return status["raw.port"];
  } else {
    throw Error("no raw server listening");
  }
}

async function get_port(
  port_number: string,
  type: string,
  project_id: string,
  compute_server: any,
  database?: any
): Promise<string> {
  if (type === "raw") {
    return await raw_server_port(project_id, compute_server);
  } else if (port_number === "jupyter") {
    return await callback_opts(hub_proxy.jupyter_server_port)({
      project_id,
      compute_server: compute_server,
      database: database
    });
  } else {
    return port_number;
  }
}

export async function init_http_proxy(
  express_app: any,
  database: any,
  base_url: string,
  compute_server: any,
  logger: any
): Promise<void> {
  await hub_proxy.init_smc_version(database);

  async function handle_proxy_request(req, res): Promise<void> {
    if (hub_proxy.version_check(req, res, base_url)) {
      logger.debug("http_proxy: version check failed");
      return;
    }
    if (req.headers["cookie"] != null) {
      req.headers["cookie"] = hub_proxy.strip_remember_me_cookie(
        req.headers["cookie"]
      ).cookie;
    }
    const req_url: string = req.url.slice(base_url.length);
    const { type, key, port_number, project_id } = target_parse_req(req_url);

    let proxy = proxy_cache[key];
    if (proxy != null) {
      // easy case -- just use cached proxy
      proxy.web(req, res);
      return;
    }

    // We have to make the proxy.
    logger.debug(`http_proxy: req_url='${req_url}', port='${port_number}'`);
    let port;
    try {
      port = await get_port(
        port_number,
        type,
        project_id,
        compute_server,
        database
      );
    } catch (err) {
      res.status(500).send(`internal error: ${err}`);
      return;
    }
    logger.debug(`port='${port}'`);
    const target = `http://localhost:${port}`;
    proxy = createProxyServer({
      ws: false,
      target
    });

    // Workaround for bug https://github.com/nodejitsu/node-http-proxy/issues/1142; otherwise
    // POST's with body just hang.
    proxy.on("proxyReq", (proxyReq, req) => {
      if (req.body && req.complete) {
        const bodyData = JSON.stringify(req.body);
        proxyReq.setHeader("Content-Type", "application/json");
        proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
      }
    });

    proxy_cache[key] = proxy;
    proxy.on("error", () => delete proxy_cache[key]); // when connection dies, clear from cache

    // also delete after a minute  - caching is only to optimize many requests near each other
    setTimeout(() => delete proxy_cache[key], 60 * 1000 * 60);

    // Finally actually handle this request.
    proxy.web(req, res);
  }

  const port_regexp = `^${base_url}\/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}\/*`;

  express_app.get(port_regexp, handle_proxy_request);
  express_app.post(port_regexp, handle_proxy_request);
}

export function init_websocket_proxy(
  http_server: any,
  database: any,
  base_url: string,
  compute_server: any,
  logger: any
): void {
  async function handle_upgrade(req, socket, head): Promise<void> {
    if (hub_proxy.version_check(req, undefined, base_url)) {
      logger.debug("http_proxy: websocket upgrade -- version check failed");
      return;
    }
    let proxy;
    const req_url = req.url.slice(base_url.length);
    logger.debug(`websocket_proxy.handle_upgrade: "${req_url}"`);
    const { type, key, port_number, project_id } = target_parse_req(req_url);
    proxy = websocket_proxy_cache[key];
    if (proxy !== undefined) {
      // easy case -- already have a proxy in the cache.
      proxy.ws(req, socket, head);
      return;
    }

    logger.debug("websocket", "upgrade -- creating proxy");
    let port;
    try {
      port = await get_port(
        port_number,
        type,
        project_id,
        compute_server,
        database
      );
    } catch (err) {
      // TODO: I don't know how to fail this...
      //res.status(500).send(`internal error: ${err}`);
      return;
    }

    proxy = createProxyServer({
      ws: true,
      target: `ws://localhost:${port}`
    });
    proxy.on("error", function(e) {
      logger.debug(
        "websocket",
        `websocket proxy error, so clearing cache -- ${e}`
      );
      delete websocket_proxy_cache[key];
    });
    websocket_proxy_cache[key] = proxy;
    proxy.ws(req, socket, head);
  }
  http_server.on("upgrade", handle_upgrade);
}

// Create and expose the share server
export function init_share_server(
  express_app: any,
  database: object,
  base_url: string,
  logger: any
) {
  const url = base_url + "/share";
  logger.debug("init_share_server: initializing share server at ", url);
  const PROJECT_PATH: string = require("../conf").project_path();
  const share_router = require("../share/server").share_router({
    database: database,
    path: `${PROJECT_PATH}/[project_id]`,
    base_url: base_url,
    logger: logger
  });
  express_app.use(url, share_router);
}
