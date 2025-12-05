import * as http from "node:http";
import type { Socket } from "node:net";
import httpProxy from "http-proxy-3";
import type express from "express";
import { getLogger } from "@cocalc/backend/logger";
import { isValidUUID } from "@cocalc/util/misc";
import { getPorts } from "./container";
import TTLCache from "@isaacs/ttlcache";
import listen from "@cocalc/backend/misc/async-server-listen";

const logger = getLogger("project-proxy:http");

const CACHE_TTL = 1000;
const cache = new TTLCache<string, { proxy?: number; err? }>({
  max: 100000,
  ttl: CACHE_TTL,
  updateAgeOnGet: true,
});

type Target = { host: string; port: number };

type ResolveResult = { target?: Target; handled: boolean };

type ResolveFn = (
  req: http.IncomingMessage,
) => Promise<ResolveResult> | ResolveResult;

interface StartOptions {
  port?: number; // default 8080
  host?: string; // default 127.0.0.1
  resolveTarget?: ResolveFn;
}

function parseProjectId(url: string | undefined): string | null {
  if (!url || !url.startsWith("/")) return null;
  const first = url.split("/")[1];
  if (!first || !isValidUUID(first)) return null;
  return first;
}

async function defaultResolveTarget(
  req: http.IncomingMessage,
): Promise<ResolveResult> {
  const project_id = parseProjectId(req.url);
  if (!project_id) {
    return { handled: false };
  }
  if (cache.has(project_id)) {
    const { proxy, err } = cache.get(project_id)!;
    if (err) throw err;
    return { target: { host: "localhost", port: proxy! }, handled: true };
  }
  let proxy: number | undefined;
  try {
    ({ proxy } = await getPorts({ volume: `project-${project_id}` }));
    if (!proxy) {
      throw Error("no proxy server");
    }
  } catch (err) {
    cache.set(project_id, { err });
    throw err;
  }
  cache.set(project_id, { proxy });
  return { target: { host: "localhost", port: proxy }, handled: true };
}

export async function startProxyServer({
  port = 8080,
  host = "127.0.0.1",
  resolveTarget = defaultResolveTarget,
}: StartOptions = {}) {
  logger.debug("startProxyServer", { port, host });

  const { handleRequest, handleUpgrade } = createProxyHandlers({
    resolveTarget,
  });

  const proxyServer = http.createServer(handleRequest);
  proxyServer.on("upgrade", handleUpgrade);

  await listen({
    server: proxyServer,
    port,
    host,
    desc: "project HTTP proxy server",
  });

  return proxyServer;
}

export function createProxyHandlers({
  resolveTarget = defaultResolveTarget,
}: { resolveTarget?: ResolveFn } = {}) {
  const proxy = httpProxy.createProxyServer({
    xfwd: true,
    ws: true,
  });

  proxy.on("error", (err, req) => {
    const url = (req as http.IncomingMessage).url;
    logger.warn("proxy error", { err: `${err}`, url });
  });

  proxy.on("proxyReq", (proxyReq) => {
    proxyReq.setHeader("X-Proxy-By", "cocalc-proxy");
  });

  proxy.on("proxyReqWs", (_proxyReq, req) => {
    logger.debug("forwarding-ws", {
      url: req.url,
      host: req.headers?.host,
      origin: req.headers?.origin,
    });
  });

  const handleRequest = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) => {
    try {
      const { target, handled } = await resolveTarget(req);
      if (!handled || !target) throw new Error("not matched");
      proxy.web(req, res, { target, prependPath: false });
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found\n");
    }
  };

  const handleUpgrade = async (
    req: http.IncomingMessage,
    socket: Socket,
    head: Buffer,
  ) => {
    try {
      const { target, handled } = await resolveTarget(req);
      if (!handled || !target) {
        throw new Error("not matched");
      }
      logger.debug("upgrade", { url: req.url, target });
      proxy.ws(req, socket, head, { target, prependPath: false });
    } catch {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
  };

  return { handleRequest, handleUpgrade };
}

// Express-friendly wrapper used by project-host.
export function attachProjectProxy({
  httpServer,
  app,
  resolveTarget = defaultResolveTarget,
}: {
  httpServer: http.Server;
  app: express.Application;
  resolveTarget?: ResolveFn;
}) {
  const proxy = httpProxy.createProxyServer({
    xfwd: true,
    ws: true,
  });

  proxy.on("error", (err, req) => {
    logger.debug("proxy error", { err: `${err}`, url: req?.url });
  });

  proxy.on("proxyReqWs", (_proxyReq, req) => {
    logger.debug("forwarding-ws", {
      url: req.url,
      host: req.headers?.host,
      origin: req.headers?.origin,
    });
  });

  app.use(async (req, res, next) => {
    // Only proxy URLs that start with a project UUID segment.
    if (!parseProjectId(req.url)) return next();
    try {
      const { target, handled } = await resolveTarget(req);
      logger.debug("resolveTarget", { url: req.url, handled, target });
      if (!handled || !target) return next();
      proxy.web(req, res, { target, prependPath: false });
    } catch (err) {
      logger.debug("proxy request failed", { err: `${err}`, url: req.url });
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "text/plain" });
      }
      res.end("Bad Gateway\n");
    }
  });

  httpServer.prependListener("upgrade", async (req, socket, head) => {
    // Only proxy project-scoped websocket upgrades.
    if (!parseProjectId(req.url)) return;
    try {
      const { target, handled } = await resolveTarget(req);
      if (!handled || !target) {
        return;
      }
      proxy.ws(req, socket, head, { target, prependPath: false });
    } catch {
      socket.write("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
      socket.destroy();
    }
  });
}
