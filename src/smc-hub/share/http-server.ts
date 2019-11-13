/*
Simple http server that serves share server, is used for local
development (cc-in-cc), the Docker image, and in production for
the main share server.
*/

import * as express from "express";
import * as http from "http";

// import * as hub_register from "../hub_register";
const hub_register = require("../hub_register");

// import * as share from "./share";
const share = require("./share");

// import { virtual_hosts } from "./virtual-hosts";
const { virtual_hosts } = require("./virtual-hosts");

import { Database, Logger } from "./types";

export async function init(opts: {
  database: Database;
  base_url: string;
  share_path: string;
  logger?: Logger;
}): Promise<{ http_server: any; express_router: any }> {
  if (opts.logger != null) {
    opts.logger.debug(
      `initializing share server using share_path='${opts.share_path}', base_url='${opts.base_url}'`
    );
  }

  // Create an express application
  const router = express.Router();
  const app = express();

  // Enable gzip compression, as suggested by
  // http://expressjs.com/en/advanced/best-practice-performance.html#use-gzip-compression
  const compression = require("compression");
  app.use(compression());

  const vhost = await virtual_hosts({
    database: opts.database,
    share_path: opts.share_path,
    base_url: opts.base_url,
    logger: opts.logger
  });

  app.use(vhost);

  router.get("/alive", function(_req, res): void {
    if (!hub_register.database_is_working()) {
      // this will stop haproxy from routing traffic to us
      // until db connection starts working again.
      if (opts.logger != null) {
        opts.logger.debug("alive: answering *NO*");
      }
      res.status(404).end();
    } else {
      res.send("alive");
    }
  });

  let share_router: any;

  if (opts.share_path) {
    share_router = share.share_router({
      database: opts.database,
      path: opts.share_path,
      logger: opts.logger,
      base_url: opts.base_url
    });
  }

  if (opts.base_url) {
    app.use(opts.base_url, router);
    if (opts.share_path) {
      app.use(opts.base_url + "/share", share_router);
    }
    if ((global as any).window != null) {
      (global as any).window["app_base_url"] = opts.base_url;
    }
  } else {
    app.use(router);
    if (opts.share_path) {
      app.use("/share", share_router);
    }
  }

  const http_server = http.createServer(app);
  return { http_server, express_router: router };
}
