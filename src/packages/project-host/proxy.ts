import httpProxy from "http-proxy-3";
import type { Server as HttpServer, IncomingMessage } from "node:http";
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

async function resolveTarget(
  req: IncomingMessage,
): Promise<{ target?: string; handled: boolean }> {
  const parsed = parseProjectPath(req.url ?? "");
  if (!parsed) {
    return { handled: false };
  }
  const { project_id } = parsed;
  const { http_port } = getProjectPorts(project_id);
  if (!http_port) {
    throw new Error(`no http_port recorded for project ${project_id}`);
  }
  const target = `http://127.0.0.1:${http_port}${req.url}`;
  return { target, handled: true };
}

export function attachProjectProxy(httpServer: HttpServer) {
  const proxy = httpProxy.createProxyServer({
    xfwd: true,
    ws: true,
  });

  proxy.on("error", (err, req) => {
    logger.debug("proxy error", { err: `${err}`, url: req?.url });
  });

  // HTTP requests
  httpServer.prependListener("request", async (req, res) => {
    try {
      const { target, handled } = await resolveTarget(req);
      logger.debug("resolveTarget", { url: req.url, handled, target });
      if (!handled || !target) {
        return; // let Express/other handlers process it
      }
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
  httpServer.prependListener("upgrade", async (req, socket, head) => {
    try {
      const { target, handled } = await resolveTarget(req);
      if (!handled || !target) {
        return; // allow other upgrade handlers to run
      }
      proxy.ws(req, socket, head, { target });
    } catch {
      socket.write("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
      socket.destroy();
    }
  });
}
