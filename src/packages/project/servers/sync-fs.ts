/*
Start sync-fs websocket endpoint.

This listens for connections then streams and extracts a tarball.

This is how all the real data gets sent back and forth for
@cocalc/sync-fs.
*/

import { join } from "node:path";
import type { Server } from "http";
import { getLogger } from "@cocalc/project/logger";
import { WebSocketServer } from "ws";
import { parse } from "url";
import recvFiles from "@cocalc/sync-fs/lib/recv-files";
import sendFiles from "@cocalc/sync-fs/lib/send-files";

const logger = getLogger("cocalc:project:server:sync-fs");

export default function initSyncFs(server: Server, basePath: string): void {
  initReceive(server, basePath);
  initSend(server, basePath);
}

function initReceive(server, basePath) {
  const path = join(basePath, ".smc", "sync-fs", "recv");
  logger.info(`Initializing syncfs-recv server`, path);

  const wss = new WebSocketServer({ noServer: true });
  wss.on("connection", (ws) => {
    logger.debug("syncfs-recv server: got new connection");
    ws.once("message", (mesg) => {
      logger.debug("syncfs-recv server: received args", mesg);
      const args = JSON.parse(mesg.toString());
      logger.debug("parse", args);
      recvFiles({ ws, args, HOME: process.env.HOME });
    });
  });

  server.on("upgrade", (request, socket, head) => {
    const { pathname } = parse(request.url ?? "");
    if (pathname === path) {
      logger.info("creating new syncfs-recv handler");
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });
}

function initSend(server, basePath) {
  const path = join(basePath, ".smc", "sync-fs", "send");
  logger.info(`Initializing syncfs-send server`, path);
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws) => {
    logger.debug("syncfs-send server: got new connection");
    ws.once("message", (mesg) => {
      logger.debug("syncfs-send server: received", mesg);
      const args = JSON.parse(mesg.toString());
      logger.debug("parse", args);
      sendFiles({ ws, args, HOME: process.env.HOME });
    });
  });

  server.on("upgrade", (request, socket, head) => {
    const { pathname } = parse(request.url ?? "");
    if (pathname === path) {
      logger.info("creating new syncfs-recv handler");
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });
}
