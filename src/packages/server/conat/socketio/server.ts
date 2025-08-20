/*
To start this standalone

   s = await require('@cocalc/server/conat/socketio').initConatServer()

It will also get run integrated with the hub if the --conat-server option is passed in.

How to make a cluster of two servers:

    s1 = await require('@cocalc/server/conat/socketio').initConatServer({port:3000, clusterName:'my-cluster', id:'s1', systemAccountPassword:'x', path:'/'}); 0

and in another session:

    s2 = await require('@cocalc/server/conat/socketio').initConatServer({port:3001,  clusterName:'my-cluster', id:'s2', systemAccountPassword:'x', path:'/'}); 0

    await s2.join('http://localhost:3000')

    s2.clusterTopology()

        // { 'my-cluster': { s1: 'http://localhost:3000', s2: 'http://localhost:3001' }}

Then in another terminal, make a client connected to each:

    c1 = require('@cocalc/conat/core/client').connect({address:'http://localhost:3000',
     systemAccountPassword:'x'});
    c2 = require('@cocalc/conat/core/client').connect({address:'http://localhost:3001',
     systemAccountPassword:'x'});

    c1.watch('foo')
    c2.publishSync('foo', 'hi')

*/

import { hostname } from "node:os";
import { join } from "node:path";

import basePath from "@cocalc/backend/base-path";
import "@cocalc/backend/conat";
import "@cocalc/backend/conat/persist"; // initializes context
import {
  conatClusterName as clusterName,
  conatClusterHealthPort,
  conatClusterPort,
  conatPassword,
  conatSocketioCount,
} from "@cocalc/backend/data";
import { getLogger } from "@cocalc/backend/logger";
import { secureRandomString } from "@cocalc/backend/misc";
import port from "@cocalc/backend/port";
import type { ConatServer } from "@cocalc/conat/core/server";
import {
  init as createConatServer,
  type Options,
} from "@cocalc/conat/core/server";
import { getUser, isAllowed } from "./auth";
import { dnsScan, localAddress, SCAN_INTERVAL } from "./dns-scan";
import { handleHealth } from "./health";
import { handleMetrics, initMetrics } from "./metrics";

const logger = getLogger("conat-server");

async function checkPortAvailable(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const { createServer } = require("http");
    const server = createServer();

    server.listen(port, () => {
      server.close(() => resolve());
    });

    server.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        reject(
          new Error(
            `Port ${port} is already in use. Another CoCalc server may already be running. Please stop the existing server or use a different port.`,
          ),
        );
      } else {
        reject(err);
      }
    });
  });
}

export async function init(
  options0: Partial<Options> & { kucalc?: boolean } = {},
) {
  logger.debug("init");
  const { kucalc, ...options } = options0;

  // In development mode, check if port is available to prevent multiple servers
  if (process.env.NODE_ENV !== "production" && !kucalc) {
    await checkPortAvailable(port);
  }

  if (kucalc) {
  }

  const opts = {
    getUser,
    isAllowed,
    systemAccountPassword:
      options.systemAccountPassword ?? (await secureRandomString(64)),
    path: join(basePath, "conat"),
    port,
    clusterName,
    ...options,
  };

  if (kucalc) {
    // In Kubernetes we do two things differently:
    //   - the server id is derived from the hostname
    //   - we use dns to periodically lookup the other servers and join to them.
    // we might switch to something else, but for now this should be fine
    opts.systemAccountPassword = conatPassword;
    opts.clusterIpAddress = await localAddress();
    if (!opts.clusterName) {
      opts.clusterName = "default";
    }
    if (!opts.id) {
      opts.id = hostname().split("-").slice(-1)[0];
    }
    // make this very short in k8s because we use the k8s api to get
    // the exact nodes frequently, so even if there was a temporary split
    // brain and each side stopped trying to connect to the other side,
    // things would get fixed by k8s within SCAN_INTERVAL.
    opts.forgetClusterNodeInterval = 4 * SCAN_INTERVAL;
    const server = createConatServer(opts);
    // enable dns scanner
    dnsScan(server); // we don't await it, it runs forever
    await startVitalsServer(server);
    return server;
  }

  if ((conatSocketioCount ?? 1) <= 1) {
    return createConatServer(opts);
  } else {
    return createConatServer({
      ...opts,
      ssl: false,
      httpServer: undefined,
      port: conatClusterPort,
      localClusterSize: conatSocketioCount,
      clusterName: "default",
      id: "node",
    });
  }
}

async function startVitalsServer(server: ConatServer) {
  // create shared HTTP server for health and metrics endpoints
  const { createServer } = await import("http");
  const vitalsServer = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      handleHealth(server, req, res);
    } else if (req.method === "GET" && req.url === "/metrics") {
      handleMetrics(req, res);
    } else {
      res.statusCode = 404;
      res.end("Not Found");
    }
  });
  vitalsServer.listen(conatClusterHealthPort);
  logger.debug(`starting vitals server on port ${conatClusterHealthPort}`);
  initMetrics(server); // start prometheus metrics collection
}
