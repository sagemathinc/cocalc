/*
This starts a very lightweight http server listening on the requested port,
which proxies all http traffic (including websockets) as follows:

 - /base_url/server/PORT/... ---> http://localhost:PORT/base_url/server/PORT/...
 - /base_url/port/PORT/...   ---> http://localhost:PORT/...


Notice that the server format strips the whole /base_url/... business, and "port"
leaves it unchanged, meaning you have to run your application aware of a base_url.

NOTE: you can use "proxy" as an alias for "server", for compatibility with code-server,
which uses /base_url/proxy/PORT/ for *exactly* what we have /base_url/server/PORT/ for.

This uses the http-proxy-3 library, which is a modern supported version
of the old http-proxy nodejs npm library, with the same API.

For our application the base_url is the project_id, optionally followed
by the compute_server_id, so url's look like

    /{project_id}[/{compute_server_id}]/[server|port]

Notes:
- <base_url> is typically `${project_id}` or `${project_id}/${compute_server_id}`.
- We set xfwd headers and support WebSockets.

This proxy gets typically exposed externally via the proxy in

   packages/file-server/ssh/proxy.ts
*/

import * as http from "node:http";
import { userInfo } from "node:os";
import httpProxy from "http-proxy-3";
import { getLogger } from "@cocalc/project/logger";
import { project_id, compute_server_id } from "@cocalc/project/data";
import listen from "@cocalc/backend/misc/async-server-listen";

const logger = getLogger("project:servers:proxy");

interface StartOptions {
  base_url?: string;
  port?: number; // default 80 for root, or 8080 for non-root
  host?: string; // default 127.0.0.1
}

export async function startProxyServer({
  base_url = getProxyBaseUrl({ project_id, compute_server_id }),
  port = userInfo().username == "root" ? 80 : 8080,
  host = "127.0.0.1",
}: StartOptions = {}) {
  logger.debug("startProxyServer", { base_url, port, host });
  const base = normalizeBase(base_url);
  const serverPattern = buildPattern(base, "server");
  const proxyPattern = buildPattern(base, "proxy");
  const portPattern = buildPattern(base, "port");

  function getTarget(req) {
    const url = req.url ?? "";
    const mPort = portPattern.exec(url);
    if (mPort) {
      const port = Number(mPort[1]);
      return { port, host: "localhost" };
    }
    const mServer = serverPattern.exec(url) || proxyPattern.exec(url);
    if (mServer) {
      const port = Number(mServer[1]);
      const rest = mServer[2] || "/";
      // Rewrite path by mutating req.url before proxying
      req.url = rest;
      return { port, host: "localhost" };
    }

    logger.debug("URL not matched", { url });
    throw Error("not matched");
  }

  const proxy = httpProxy.createProxyServer({
    xfwd: true,
    ws: true,
    // We set target per-request.
  });

  proxy.on("error", (err, req, res) => {
    const url = (req as http.IncomingMessage).url;
    logger.warn("proxy error", { err, url });
    // Best-effort error response (HTTP only):
    if (!res || (res as http.ServerResponse).headersSent) return;
    try {
      (res as http.ServerResponse).writeHead(502, {
        "Content-Type": "text/plain",
      });
      (res as http.ServerResponse).end("Bad Gateway\n");
    } catch {
      /* ignore */
    }
  });

  proxy.on("proxyReq", (proxyReq) => {
    proxyReq.setHeader("X-Proxy-By", "cocalc-lite-proxy");
  });

  const proxyServer = http.createServer((req, res) => {
    try {
      const target = getTarget(req);
      proxy.web(req, res, { target });
    } catch {
      // Not matched — 404 so it's obvious when a wrong base is used.
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found\n");
    }
  });

  proxyServer.on("upgrade", (req, socket, head) => {
    try {
      const target = getTarget(req);
      proxy.ws(req, socket, head, {
        target,
      });
    } catch {
      // Not matched — close gracefully.
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
  });

  await listen({
    server: proxyServer,
    port,
    host,
    desc: "project HTTP proxy server",
  });
  return proxyServer;
}

// Build the default base_url from project/compute ids.
function getProxyBaseUrl({
  project_id,
  compute_server_id,
}: {
  project_id: string;
  compute_server_id?: number;
}): string {
  let base_url = `${project_id}`;
  if (compute_server_id) {
    base_url += `/${compute_server_id}`;
  }
  return base_url;
}

// Ensure base_url has no leading/trailing slashes; proxy matches start after a single slash.
function normalizeBase(base_url: string): string {
  return base_url.replace(/^\/+|\/+$/g, "");
}

// Escape string for use inside a RegExp literal.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Build a matcher:
//  - type "server": ^/<base>/server/(\d+)(/.*)?$
//  - type "port":   ^/<base>/port/(\d+)(/.*)?$
function buildPattern(base: string, type: "server" | "port" | "proxy"): RegExp {
  const prefix = `/${escapeRegExp(base)}/${type}/`;
  // capture numeric port, then optionally capture the rest of the path
  return new RegExp(`^${prefix}(\\d+)(/.*)?$`);
}
