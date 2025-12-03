import httpProxy from "http-proxy-3";
import type { Server as HttpServer, IncomingMessage } from "node:http";
import type express from "express";
import getLogger from "@cocalc/backend/logger";
import { getProjectPorts } from "./sqlite/projects";
import { isValidUUID } from "@cocalc/util/misc";

const logger = getLogger("project-host:proxy");

function parseProjectPath(
  url: string,
): { project_id: string; path: string } | null {
  if (!url.startsWith("/")) return null;
  const parts = url.split("/");
  const project_id = parts[1];
  const type = parts[2];
  if (!project_id || !isValidUUID(project_id)) return null;
  if (!["port", "server", "proxy", "raw"].includes(type)) return null;
  return { project_id, path: url };
}

function resolveTarget(req: IncomingMessage): {
  target?: { host: string; port: number };
  handled: boolean;
} {
  const parsed = parseProjectPath(req.url ?? "");
  if (!parsed) {
    return { handled: false };
  }
  const { project_id } = parsed;
  const { http_port } = getProjectPorts(project_id);
  if (!http_port) {
    throw new Error(`no http_port recorded for project ${project_id}`);
  }
  // Let http-proxy append the original req.url; only set host/port here.
  const target = { host: "127.0.0.1", port: http_port };
  return { target, handled: true };
}

export function attachProjectProxy({
  httpServer,
  app,
}: {
  httpServer: HttpServer;
  app: express.Application;
}) {
  const proxy = httpProxy.createProxyServer({
    xfwd: true,
    ws: true,
  });

  proxy.on("error", (err, req) => {
    logger.debug("proxy error", { err: `${err}`, url: req?.url });
  });

  // HTTP requests via Express middleware so later handlers (e.g., 404) don't run.
  app.use((req, res, next) => {
    try {
      const { target, handled } = resolveTarget(req);
      //logger.debug("resolveTarget", { url: req.url, handled, target });
      if (!handled || !target) return next();
      proxy.web(req, res, { target });
    } catch (err) {
      logger.debug("proxy request failed", { err: `${err}`, url: req.url });
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "text/plain" });
      }
      res.end("Bad Gateway\n");
    }
  });

  // WebSocket upgrades
  httpServer.prependListener("upgrade", (req, socket, head) => {
    try {
      const { target, handled } = resolveTarget(req);
      if (!handled || !target) {
        return; // allow other upgrade handlers to run
      }
      //logger.debug("upgrade", { url: req.url, target });
      proxy.ws(req, socket, head, { target });
    } catch {
      socket.write("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
      socket.destroy();
    }
  });
}
