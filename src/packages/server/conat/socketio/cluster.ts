/*

To start this:

    pnpm conat-server

Run this to be able to use all the cores, since nodejs is (mostly) single threaded.
*/

import { init as createConatServer } from "@cocalc/conat/core/server";
import cluster from "node:cluster";
import { createServer } from "http";
import { availableParallelism } from "os";
import {
  setupMaster as setupPrimarySticky,
  setupWorker,
} from "@socket.io/sticky";
import { createAdapter, setupPrimary } from "@socket.io/cluster-adapter";
import { getUser, isAllowed } from "./auth";
import { secureRandomString } from "@cocalc/backend/misc";
import basePath from "@cocalc/backend/base-path";
import port from "@cocalc/backend/port";
import { conatSocketioCount, conatClusterPort } from "@cocalc/backend/data";
import { loadConatConfiguration } from "../configuration";
import { join } from "path";

// ensure conat logging, credentials, etc. is setup
import "@cocalc/backend/conat";

console.log(`* CONAT Core Pub/Sub Server on port ${port} *`);

async function primary() {
  console.log(`Socketio Server Primary pid=${process.pid} is running`);

  await loadConatConfiguration();

  const httpServer = createServer();
  setupPrimarySticky(httpServer, {
    loadBalancingMethod: "least-connection",
  });

  setupPrimary();
  cluster.setupPrimary({ serialization: "advanced" });
  httpServer.listen(getPort());

  const numWorkers = conatSocketioCount
    ? conatSocketioCount
    : availableParallelism();
  const systemAccountPassword = await secureRandomString(32);
  for (let i = 0; i < numWorkers; i++) {
    cluster.fork({ SYSTEM_ACCOUNT_PASSWORD: systemAccountPassword });
  }
  console.log({ numWorkers, port, basePath });

  cluster.on("exit", (worker) => {
    console.log(`Worker ${worker.process.pid} died, so making a new one`);
    cluster.fork();
  });
}

async function worker() {
  console.log("BASE_PATH=", process.env.BASE_PATH);
  await loadConatConfiguration();

  const path = join(basePath, "conat");
  console.log(`Socketio Worker pid=${process.pid} started with path=${path}`);

  const httpServer = createServer();
  const id = `${cluster.worker?.id ?? ""}`;
  const systemAccountPassword = process.env.SYSTEM_ACCOUNT_PASSWORD;
  delete process.env.SYSTEM_ACCOUNT_PASSWORD;

  const conatServer = createConatServer({
    path,
    httpServer,
    id,
    getUser,
    isAllowed,
    systemAccountPassword,
    // port -- server needs to know implicitly to make a clients
    port: getPort(),
    cluster: true,
  });
  conatServer.io.adapter(createAdapter());
  setupWorker(conatServer.io);
}

function getPort() {
  return conatClusterPort ? conatClusterPort : port;
}

if (cluster.isPrimary) {
  primary();
} else {
  worker();
}
