import { loadConatConfiguration } from "../configuration";
import {
  initPersistServer,
  initLoadBalancer,
} from "@cocalc/backend/conat/persist";
import { conatPersistCount } from "@cocalc/backend/data";
import { createForkedPersistServer } from "./start-server";
import getLogger from "@cocalc/backend/logger";
import { conat } from "@cocalc/backend/conat";

const logger = getLogger("server:conat:persist");

export async function initConatPersist() {
  logger.debug("initPersistServer: sqlite3 stream persistence", {
    conatPersistCount,
  });
  if (!conatPersistCount || conatPersistCount <= 1) {
    // only 1, so no need to use separate processes
    await loadConatConfiguration();
    const id = "0";
    initPersistServer({ id, clusterMode: true });
    initLoadBalancer({ ids: [id], client: conat() });
    return;
  }

  // more than 1 so no possible value to multiple servers if we don't
  // use separate processes
  createPersistCluster();
}

async function createPersistCluster() {
  logger.debug(
    "initPersistServer: creating cluster with",
    conatPersistCount,
    "processes",
  );
  const ids: string[] = [];
  for (let i = 0; i < conatPersistCount; i++) {
    const id = `${i}`;
    ids.push(id);
    logger.debug("initPersistServer: starting node ", { id });
    createForkedPersistServer(id);
  }
  initLoadBalancer({ ids, client: conat() });
}
