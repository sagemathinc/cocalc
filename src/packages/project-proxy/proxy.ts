/*
This starts a very lightweight http server listening on the requested port,
which proxies all http traffic to project containers as follows:

  /{project_id}/{rest} --> localhost:{port}/{project_id}/{rest}

where port is what is published as PORTS.proxy from
packages/conat/project/runner/constants.ts.

This uses the http-proxy-3 library, which is a modern supported version
of the old http-proxy nodejs npm library, with the same API.

- We set xfwd headers and support WebSockets.
*/

import * as http from "node:http";
import httpProxy from "http-proxy-3";
import { getLogger } from "@cocalc/backend/logger";
import { isValidUUID } from "@cocalc/util/misc";
import { getPorts } from "./container";
import TTLCache from "@isaacs/ttlcache";
import listen from "@cocalc/backend/misc/async-server-listen";

const logger = getLogger("file-server:http-proxy");

const CACHE_TTL = 1000;
const cache = new TTLCache<string, { proxy?: number; err? }>({
  max: 100000,
  ttl: CACHE_TTL,
  updateAgeOnGet: true,
});

interface StartOptions {
  port?: number; // default 8080
  host?: string; // default 127.0.0.1
}

export async function startProxyServer({
  port = 8080,
  host = "127.0.0.1",
}: StartOptions = {}) {
  logger.debug("startProxyServer", { port, host });

  const { handleRequest, handleUpgrade } = createProxyHandlers();

  const proxyServer = http.createServer(handleRequest);
  proxyServer.on("upgrade", handleUpgrade);

  await listen({
    server: proxyServer,
    port,
    host,
    desc: "file-server's HTTP proxy server",
  });

  return proxyServer;
}

export function createProxyHandlers() {
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
    proxyReq.setHeader("X-Proxy-By", "cocalc-proxy");
  });

  const handleRequest = async (req, res) => {
    try {
      const target = await getTarget(req);
      proxy.web(req, res, { target });
    } catch {
      // Not matched — 404 so it's obvious when a wrong base is used.
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found\n");
    }
  };

  const handleUpgrade = async (req, socket, head) => {
    try {
      const target = await getTarget(req);
      proxy.ws(req, socket, head, {
        target,
      });
    } catch {
      // Not matched — close gracefully.
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
  };

  return { handleRequest, handleUpgrade };
}

async function getProxyPort(project_id: string) {
  if (!isValidUUID(project_id)) {
    throw Error("invalid url");
  }
  if (cache.has(project_id)) {
    const { proxy, err } = cache.get(project_id)!;
    if (err) {
      throw err;
    } else {
      return proxy;
    }
  }
  let proxy;
  try {
    ({ proxy } = await getPorts({ volume: `project-${project_id}` }));
  } catch (err) {
    cache.set(project_id, { err });
    throw err;
  }
  cache.set(project_id, { proxy });
  return proxy;
}

async function getTarget(req) {
  const url = req.url ?? "";
  logger.debug("request", { url });
  // TODO: enforce a known base path and validate length before slicing to avoid
  // accepting arbitrary/short paths.
  const project_id = url.slice(1, 37);
  return { port: await getProxyPort(project_id), host: "localhost" };
}
