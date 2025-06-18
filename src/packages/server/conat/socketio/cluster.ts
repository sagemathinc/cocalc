/*

To start this:

    pnpm conat-server

Run this to be able to use all the cores, since nodejs is (mostly) single threaded.
*/

import { init as createConatServer } from "@cocalc/conat/core/server";
import cluster from "node:cluster";
import { createServer } from "http";
import { cpus } from "os";
import { setupMaster, setupWorker } from "@socket.io/sticky";
import { createAdapter, setupPrimary } from "@socket.io/cluster-adapter";
import { getUser, isAllowed } from "./auth";
import { secureRandomString } from "@cocalc/backend/misc";
import { getLogger } from "@cocalc/backend/logger";
import basePath from "@cocalc/backend/base-path";
import port from "@cocalc/backend/port";
import { conatSocketioCount } from "@cocalc/backend/data";
import { loadConatConfiguration } from "../configuration";
import { join } from "path";

console.log("* CONATS Core Pub/Sub Server *");

async function master() {
  console.log(`Master ${process.pid} is running`);

  await loadConatConfiguration();

  const httpServer = createServer();
  setupMaster(httpServer, {
    loadBalancingMethod: "least-connection",
  });

  setupPrimary();
  cluster.setupPrimary({ serialization: "advanced" });
  httpServer.listen(port);

  const numWorkers = conatSocketioCount ? conatSocketioCount : cpus().length;
  const systemAccountPassword = await secureRandomString(64);
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
  console.log(`Worker ${process.pid} started`);
  await loadConatConfiguration();

  const httpServer = createServer();
  const id = `${cluster.worker?.id ?? ""}`;
  const systemAccountPassword = process.env.SYSTEM_ACCOUNT_PASSWORD;
  delete process.env.SYSTEM_ACCOUNT_PASSWORD;

  const conatServer = createConatServer({
    logger: getLogger(`conat-server:worker-${id}`).debug,
    path: join(basePath, "conat"),
    httpServer,
    id,
    getUser,
    isAllowed,
    systemAccountPassword,
  });
  conatServer.io.adapter(createAdapter());
  setupWorker(conatServer.io);
}

if (cluster.isMaster) {
  master();
} else {
  worker();
}
