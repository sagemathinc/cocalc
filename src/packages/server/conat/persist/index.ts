import { loadConatConfiguration } from "./configuration";
import { initPersistServer } from "@cocalc/backend/conat/persist";
import { conatPersistCount } from "@cocalc/backend/data";

import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:conat:persist");

export async function initConatPersist() {
  logger.debug("initPersistServer: sqlite3 stream persistence", {
    conatPersistCount,
  });
  if (!conatPersistCount || conatPersistCount <= 1) {
    // only 1, so no need to use separate processes
    await loadConatConfiguration();
    initPersistServer();
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
    "nodes",
  );
  await loadConatConfiguration();
  for (let i = 0; i < conatPersistCount; i++) {
    initPersistServer();
  }
}
