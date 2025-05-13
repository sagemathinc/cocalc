/*

To start this:

    pnpm conat-server
    
Environment variables:

- CONAT_WORKERS - number of worker processes
- CONAT_PORT    - port to listen on

Run this on a beefy machine to use all the cores.
*/

import { init as createConatServer } from "@cocalc/nats/server/server";
import cluster from "cluster";
import * as http from "http";
import { cpus } from "os";
import { Server } from "socket.io";
import { setupMaster, setupWorker } from "@socket.io/sticky";
import { createAdapter, setupPrimary } from "@socket.io/cluster-adapter";

const DEFAULT_PORT = 3000;

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);
  const numWorkers = parseInt(process.env.CONAT_WORKERS ?? `${cpus().length}`);
  const port = parseInt(process.env.CONAT_PORT ?? `${DEFAULT_PORT}`);

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
  const natsServer = createConatServer({
    httpServer,
    Server,
    id: cluster.worker?.id ?? "",
  });
  natsServer.io.adapter(createAdapter());
  setupWorker(natsServer.io);
}
