// The HTTP(S) server, which makes the other servers
// (websocket, proxy, and share) available on the network.

import { Application } from "express";
import { readFileSync } from "fs";
import { getLogger } from "../logger";
import { createServer as httpsCreateServer } from "https";
import { createServer as httpCreateServer } from "http";

interface Options {
  cert?: string;
  key?: string;
  app: Application;
}

const logger = getLogger("http:server");
export default function init({ cert, key, app }: Options) {
  let httpServer;
  if (key || cert) {
    if (!key || !cert) {
      throw Error("specify *both* key and cert or neither");
    }
    logger.info("Creating HTTPS server...");
    httpServer = httpsCreateServer(
      {
        cert: readFileSync(cert),
        key: readFileSync(key),
      },
      app,
    );
  } else {
    logger.info("Creating HTTP server...");
    httpServer = httpCreateServer(app);
  }
  httpServer.on("error", (err) => {
    logger.error(`WARNING -- hub http server error: ${err.stack || err}`);
  });

  return httpServer;
}
