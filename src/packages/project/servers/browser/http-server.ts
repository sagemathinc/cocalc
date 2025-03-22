/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
This is an express http server that is meant to receive connections
only from web browser clients that signed in as collaborators on
this projects.  It serves both HTTP and websocket connections, which
should be proxied through some hub.
*/

import compression from "compression";
import express from "express";
import { createServer } from "http";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import basePath from "@cocalc/backend/base-path";
import initWebsocket from "@cocalc/project/browser-websocket/server";
import initWebsocketFs from "../websocketfs";
import initSyncFs from "../sync-fs";
import { browserPortFile, project_id } from "@cocalc/project/data";
import initDirectoryListing from "@cocalc/project/directory-listing";
import { getOptions } from "@cocalc/project/init-program";
import * as kucalc from "@cocalc/project/kucalc";
import { getLogger } from "@cocalc/project/logger";
import { once } from "@cocalc/util/async-utils";
import initRootSymbolicLink from "./root-symlink";

const winston = getLogger("browser-http-server");

export default async function init(): Promise<void> {
  winston.info("starting server...");

  const base = join(basePath, project_id, "raw") + "/";

  const app = express();
  app.disable("x-powered-by"); // https://github.com/sagemathinc/cocalc/issues/6101

  const server = createServer(app);

  // WEBSOCKET SERVERS
  // **CRITICAL:** This *must* be above the app.use(compression())
  // middleware below, since compressing/uncompressing the websocket
  // would otherwise happen, and that slows it down a lot.
  // Setup the ws websocket server, which is used by clients
  // for direct websocket connections to the project, and also
  // serves primus.js, which is the relevant client library.
  winston.info("initializing websocket server");
  // We have to explicitly also include the base as a parameter
  // to initWebsocket, since of course it makes deeper user of server.
  app.use(base, initWebsocket(server, base));
  initWebsocketFs(server, base);
  // This uses its own internal lz4 compression:
  initSyncFs(server, base);

  // CRITICAL: keep this after the websocket stuff or anything you do not
  // want to have compressed.
  // suggested by http://expressjs.com/en/advanced/best-practice-performance.html#use-gzip-compression
  app.use(compression());

  winston.info("creating root symbolic link");
  await initRootSymbolicLink();

  if (kucalc.IN_KUCALC) {
    // Add /health (used as a health check for Kubernetes) and /metrics (Prometheus)
    winston.info("initializing KuCalc only health metrics server");
    kucalc.init_health_metrics(app, project_id);
  }

  // Setup the directory_listing/... server, which is used to provide directory listings
  // to the hub (at least in KuCalc).  It is still used by HUB!  But why?  Maybe it is only
  // for the deprecated public access to a project?  If so, we can get rid of all of that.
  winston.info("initializing directory listings server (DEPRECATED)");
  app.use(base, initDirectoryListing());

  const options = getOptions();
  server.listen(options.browserPort, options.hostname);
  await once(server, "listening");
  const address = server.address();
  if (address == null || typeof address == "string") {
    // null = failed; string doesn't happen since that's for unix domain
    // sockets, which we aren't using.
    // This is probably impossible, but it makes typescript happier.
    throw Error("failed to assign a port");
  }
  const assignedPort = address.port; // may be a server assigned random port.
  winston.info(
    `Started -- port=${assignedPort}, host='${options.hostname}', base='${base}'`,
  );

  winston.info(`Writing port to ${browserPortFile}`);
  await writeFile(browserPortFile, `${assignedPort}`);
}
