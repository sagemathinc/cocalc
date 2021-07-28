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

export default function init({ cert, key, app }: Options) {
  const winston = getLogger("init-http-server");
  if (key || cert) {
    if (!key || !cert) {
      throw Error("specify *both* key and cert or neither");
    }
    winston.info("Creating HTTPS server...");
    return httpsCreateServer(
      {
        cert: readFileSync(cert),
        key: readFileSync(key),
      },
      app
    );
  } else {
    winston.info("Creating HTTP server...");
    return httpCreateServer(app);
  }
}
