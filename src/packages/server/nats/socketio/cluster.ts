/*

To start this:

    pnpm conat-cluster
    
Environment variables:

- CONAT_WORKERS - number of worker processes
- CONAT_PORT    - port to listen on

Run this on a beefy machine to use all the cores.

WARNING: this doesn't work at all with how we implemented subscriptions.  We must use valkey.
*/

import { init as createConatServer } from "@cocalc/nats/server/server";
import cluster from "cluster";
import * as http from "http";
import { cpus } from "os";
import { Server } from "socket.io";
import { setupMaster, setupWorker } from "@socket.io/sticky";
import { createAdapter, setupPrimary } from "@socket.io/cluster-adapter";

const DEFAULT_PORT = 3000;

const numWorkers = parseInt(process.env.CONAT_WORKERS ?? `${cpus().length}`);
const port = parseInt(process.env.CONAT_PORT ?? `${DEFAULT_PORT}`);

console.log("* CONATS *");
console.log({ numWorkers, port });

if (numWorkers <= 1) {
  console.log("Running in non-cluster mode since numWorkers=1");
  createConatServer({ port, Server, logger: console.log });
} else {
  if (cluster.isMaster) {
    console.log(`Master ${process.pid} is running`);

    const httpServer = http.createServer();

    setupMaster(httpServer, {
      loadBalancingMethod: "least-connection",
    });

    setupPrimary();

    cluster.setupPrimary({ serialization: "advanced" });
    httpServer.listen(port);

    for (let i = 0; i < numWorkers; i++) {
      cluster.fork();
    }

    cluster.on("exit", (worker) => {
      console.log(`Worker ${worker.process.pid} died`);
      cluster.fork();
    });
  } else {
    console.log(`Worker ${process.pid} started`);
    const httpServer = http.createServer();
    const id = cluster.worker?.id ?? "";
    const natsServer = createConatServer({
      httpServer,
      Server,
      id,
      logger: console.log,
    });
    natsServer.io.adapter(createAdapter());
    setupWorker(natsServer.io);
  }
}
