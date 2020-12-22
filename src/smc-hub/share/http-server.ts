/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Simple http server that serves share server, is used for local
development (cc-in-cc), the Docker image, and in production for
the main share server.
*/

import * as path from "path";
import * as fs from "fs";
import { promisify } from "util";
const fs_access = promisify(fs.access);

import * as express from "express";
import * as http from "http";

import { setup_healthchecks, Check } from "../healthchecks";

// import * as share from "./share";
const share = require("./share");

// import { virtual_hosts } from "./virtual-hosts";
const { virtual_hosts } = require("./virtual-hosts");

import { Logger } from "./types";
import { PostgreSQL } from "../postgres/types";

function extra_healthcheck(share_path: string): () => Promise<Check> {
  // this gives the parent dir of `/.../project-[...]/` !
  const share_path_dir = path.parse(share_path).dir;
  return async () => {
    try {
      await fs_access(share_path_dir);
    } catch (err) {
      const status = `share_path_dir='${share_path_dir}' NOT accessible`;
      return { status, abort: true };
    }
    const status = `share_path_dir='${share_path_dir}' accessible`;
    return { status, abort: false };
  };
}

export async function init(opts: {
  database: PostgreSQL;
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
    logger: opts.logger,
  });

  app.use(vhost);

  setup_healthchecks({
    router: router,
    db: opts.database,
    extra: [extra_healthcheck(opts.share_path)],
  });

  let share_router: any;

  if (opts.share_path) {
    share_router = share.share_router({
      database: opts.database,
      path: opts.share_path,
      logger: opts.logger,
      base_url: opts.base_url,
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
