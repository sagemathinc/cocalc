/*
Start a websocketfs server.
*/

import { join } from "node:path";
import type { Server } from "http";
import { Server as SftpServer } from "websocket-sftp";
import { getLogger } from "@cocalc/project/logger";
import { WebSocketServer } from "ws";
import { parse } from "url";

const log = getLogger("cocalc:websocketfs");

export default function initWebsocketFs(
  server: Server,
  basePath: string,
  { host, port },
): void {
  const path = join(basePath, ".smc", "websocketfs");
  log.info(
    `Initalizing websocketfs filesystem server at "ws://${host}:${port}${path}"...`,
  );

  const wss = new WebSocketServer({ noServer: true });

  const sftpServer = new SftpServer({
    virtualRoot: process.env.HOME,
    wss,
  });

  process.on("exit", () => {
    sftpServer.end();
  });

  server.on("upgrade", (request, socket, head) => {
    const { pathname } = parse(request.url ?? "");
    log.info("Got upgrade request for ", pathname);
    if (pathname === path) {
      log.info("creating new websocketfs handler");
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      log.info("not handling here");
    }
  });
}
