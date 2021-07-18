/*
This is an express http server that is meant to receive connections
only from web browser clients that signed in as collaborators on
this projects.  It serves both HTTP and websocket connections, which
should be proxied through some hub.
*/

import * as express from "express";
import { createServer } from "http";
import { callback } from "awaiting";
import * as compression from "compression";
import * as bodyParser from "body-parser";
import { join } from "path";
import { writeFile } from "fs";
import { once } from "smc-util/async-utils";
import { options } from "smc-project/init-program";
import basePath from "smc-util-node/base-path";
import { getLogger } from "smc-project/logger";
import { browserPortFile, project_id } from "smc-project/data";
import initDirectoryListing from "smc-project/directory-listing";
import initJupyter from "smc-project/jupyter/http-server";
import initWebsocket from "smc-project/browser-websocket/server";
import initUpload from "smc-project/upload";
import initStaticServer from "./static";
import initRootSymbolicLink from "./root-symlink";
const kucalc = require("smc-project/kucalc");

const winston = getLogger("browser-http-server");

export default async function init(): Promise<void> {
  winston.info("starting server...");

  const app = express();
  const server = createServer(app);

  // suggested by http://expressjs.com/en/advanced/best-practice-performance.html#use-gzip-compression
  app.use(compression());

  // Needed for POST file to custom path, which is used for uploading files to projects.
  // parse application/x-www-form-urlencoded
  app.use(bodyParser.urlencoded({ extended: true }));
  // parse application/json
  app.use(bodyParser.json());

  winston.info("creating root symbolic link");
  await initRootSymbolicLink();

  const base = join(basePath, project_id, "raw") + "/";

  if (kucalc.IN_KUCALC) {
    // Add a /health handler, which is used as a health check for Kubernetes.
    winston.info("initializing KuCalc only health metrics server");
    kucalc.init_health_metrics(server, project_id);
  }

  // Setup the directory_listing/... server, which is used to provide directory listings
  // to the hub (at least in KuCalc).  It is still used by HUB!  But why?  Maybe it is only
  // for the deprecated public access to a project?  If so, we can get rid of all of that.
  winston.info("initializing directory listings server (DEPRECATED)");
  app.use(base, initDirectoryListing());

  // Setup the jupyter/... server, which is used by our jupyter server for blobs, etc.
  winston.info("initializing Jupyter support HTTP server");
  app.use(base, initJupyter());

  // Setup the ws websocket server, which is used by clients
  // for direct websocket connections to the project, and also
  // serves primus.js, which is the relevant client library.
  winston.info("initializing websocket server");
  // We have to explicitly also include the base as a parameter
  // to initWebsocket, since of course it makes deeper user of server.
  app.use(base, initWebsocket(server, base));

  // Setup the upload POST endpoint
  winston.info("initializing file upload server");
  app.use(base, initUpload());

  winston.info("initializing static server");
  initStaticServer(app, base);

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
    `Started -- port=${assignedPort}, host='${options.hostname}', base='${base}'`
  );

  winston.info(`Writing port to ${browserPortFile}`);
  await callback(writeFile, browserPortFile, `${assignedPort}`);
}
