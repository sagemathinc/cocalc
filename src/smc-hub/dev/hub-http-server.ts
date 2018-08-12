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

function target_parse_req(
  url: string
): {
  key: string;
  port_number: string; // yes, as a string.
  project_id: string;
} {
  return hub_proxy.target_parse_req("", url);
}

export function init_http_proxy(
  express_app: any,
  database: any,
  base_url: string,
  compute_server: any,
  logger: any
): void {
  function handle_proxy_request(req, res): void {
    if (req.headers["cookie"] != null) {
      req.headers["cookie"] = hub_proxy.strip_remember_me_cookie(
        req.headers["cookie"]
      ).cookie;
    }
    const req_url: string = req.url.slice(base_url.length);
    const { key, port_number, project_id } = target_parse_req(req_url);

    let proxy = proxy_cache[key];
    if (proxy != null) {
      // easy case -- just use cached proxy
      proxy.web(req, res);
      return;
    }

    // Have to make the proxy.
    logger.debug(`http_proxy: req_url='${req_url}', port='${port_number}'`);
    function get_port(cb) {
      if (port_number === "jupyter") {
        hub_proxy.jupyter_server_port({
          project_id,
          compute_server: compute_server,
          database: database,
          cb
        });
      } else {
        cb(undefined, port_number);
      }
    }
    get_port(function(err, port) {
      logger.debug(`get_port: port='${port}'`);
      if (err) {
        res.status(500).send(`internal error: ${err}`);
      } else {
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
    });
  }

  const port_regexp = `^${base_url}\/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}\/port\/*`;

  express_app.get(port_regexp, handle_proxy_request);
  express_app.post(port_regexp, handle_proxy_request);
}

// TODO: combine this function and above somehow.

export function init_raw_proxy(
  express_app: any,
  base_url: string,
  compute_server: any,
  logger: any
): void {
  // Also, ensure the raw server works
  function handle_proxy_request(req, res) {
    // avoid XSS...
    if (req.headers["cookie"] != null) {
      req.headers["cookie"] = hub_proxy.strip_remember_me_cookie(
        req.headers["cookie"]
      ).cookie;
    }

    //logger.debug("cookie=#{req.headers['cookie']}")
    const req_url = req.url.slice(base_url.length);
    const { key, project_id } = target_parse_req(req_url);
    logger.debug(`dev_proxy_raw '${project_id}', '${key}','${req_url}'`);
    let proxy = proxy_cache[key];
    if (proxy != null) {
      logger.debug("dev_proxy_raw: use cache");
      proxy.web(req, res);
      return;
    }
    compute_server.project({
      project_id,
      cb(err, project) {
        if (err) {
          res.status(500).send(`internal error: ${err}`);
        } else {
          project.status({
            cb(err, status) {
              if (err) {
                res.status(500).send(`internal error: ${err}`);
              } else if (!status["raw.port"]) {
                res.status(500).send("no raw server listening");
              } else {
                const port = status["raw.port"];
                const target = `http://localhost:${port}`;
                logger.debug(`dev_proxy_raw: connnect to ${target}`);
                proxy = createProxyServer({
                  ws: false,
                  target
                });

                // Workaround for bug https://github.com/nodejitsu/node-http-proxy/issues/1142
                proxy.on("proxyReq", (proxyReq, req) => {
                  if (req.body && req.complete) {
                    const bodyData = JSON.stringify(req.body);
                    proxyReq.setHeader("Content-Type", "application/json");
                    proxyReq.setHeader(
                      "Content-Length",
                      Buffer.byteLength(bodyData)
                    );
                    proxyReq.write(bodyData);
                  }
                });

                proxy_cache[key] = proxy;

                // when connection dies, clear from cache
                proxy.on("error", () => delete proxy_cache[key]);
                proxy.web(req, res);
                // also delete eventually (1 hour)
                setTimeout(() => delete proxy_cache[key], 1000 * 60 * 60);
              }
            }
          });
        }
      }
    });
  }

  const raw_regexp = `^${base_url}\/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}\/raw*`;
  express_app.get(raw_regexp, handle_proxy_request);
  express_app.post(raw_regexp, handle_proxy_request);
}

export function init_websocket_proxy(
  compute_server: any,
  base_url: string,
  http_server: any,
  logger: any
): void {
  function handle_upgrade(req, socket, head) {
    let proxy;
    logger.debug(`\n\n*** http_server websocket(${req.url}) ***\n\n`);
    const req_url = req.url.slice(base_url.length);
    const key = `ws://${location.host}:${location.port}`;
    logger.debug(`websocket upgrade -- '${key}', '${req_url}'`);
    logger.debug("computer_server", compute_server);
    proxy = websocket_proxy_cache[key];
    if (proxy === undefined) {
      logger.debug("websocket", "upgrade -- creating proxy");
      proxy = createProxyServer({
        ws: true,
        target: "ws://localhost:" /* todo --- figure out the port */
      });
      proxy.on("error", function(e) {
        logger.debug(
          "websocket",
          `websocket proxy error, so clearing cache -- ${e}`
        );
        delete websocket_proxy_cache[key];
      });
      websocket_proxy_cache[key] = proxy;
    } else {
      logger.debug("websocket", "upgrade -- using cache");
    }
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
