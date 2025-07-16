/*
The code here is run when conatSocketioCount > 1 (i.e., env var CONAT_SOCKETIO_COUNT).
This does NOT use the socketio cluster adapter or the nodejs cluster module.
Every worker process this spawns runs independently after it starts and there is
no single node coordinating communications like with the socketio cluster adapter,
and traffic across the cluster is minimal. This will thus *scale* much better,
though this is also just using normal TCP networking for communication instead of
IPC (like socketios cluster adapter).  Also, the traffic between nodes is precisely
what is needed for Conat, so it's really solving a differnet problem than socketio's
cluster adapter, and under the hood what this actually does is much more sophisticated,
with each node maintaining and serving sqlite backed streams of data about their state.

This code exists mainly for testing and potentially also for scaling cocalc to
more traffic when running on a single machine without Kubernetes.

One cpu support several hundred simultaneous active connections -- if you want to
have 500 active users all using projects (that also means additional connections) --
you will definitely need more than one node.
*/

import "@cocalc/backend/conat/persist";
import { init, type Options } from "@cocalc/conat/core/server";
import { getUser, isAllowed } from "./auth";
import { addErrorListeners } from "@cocalc/server/metrics/error-listener";
import { loadConatConfiguration } from "../configuration";
import { getLogger } from "@cocalc/backend/logger";

async function main() {
  console.log("conat server: starting a cluster node");

  addErrorListeners();
  const configDone = loadConatConfiguration();
  process.on("message", async (opts: Options) => {
    const logger = getLogger(`start-cluster-node:${opts.id}`);
    const msg = [
      "starting server",
      {
        ...opts,
        systemAccountPassword: "•".repeat(
          opts.systemAccountPassword?.length ?? 0,
        ),
      },
    ];
    console.log(...msg);
    logger.debug(...msg);
    // config can start before init message, but must be finished before calling init
    // (that said, most config is via env variables and the above.)
    await configDone;
    init({ ...(opts as Options), getUser, isAllowed });
  });
}

main();
